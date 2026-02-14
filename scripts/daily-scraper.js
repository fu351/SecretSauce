#!/usr/bin/env node

/**
 * Daily Ingredient Scraper (Direct RPC mode)
 *
 * - Fetches canonical ingredients from standardized_ingredients
 * - Fetches grocery store locations from grocery_stores
 * - Runs scrapers directly (no /api/batch-scraper hop)
 * - Inserts results through fn_bulk_insert_ingredient_history RPC
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  applyStoreRangeFilters,
  buildStoreFilterContext,
  emptyBatchResults,
  formatStoreFilterSummary,
  getIntEnv,
  getProductName,
  hasStoreRangeFilters,
  mapWithConcurrency,
  normalizeBatchResultsShape,
  normalizeResultsShape,
  normalizeStoreEnum,
  normalizeZipCode,
  pickBestResult,
  sleep,
  toPriceNumber,
  truncateText,
} from './utils/daily-scraper-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const scrapers = require('../lib/scrapers')

dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STORE_BRAND = process.env.STORE_BRAND || null
const STORE_CITY = process.env.STORE_CITY || null
const STORE_STATE = process.env.STORE_STATE || null
const STORE_CITIES_CSV = process.env.STORE_CITIES_CSV || null
const STORE_ZIP_MIN = process.env.STORE_ZIP_MIN || null
const STORE_ZIP_MAX = process.env.STORE_ZIP_MAX || null

const INGREDIENT_LIMIT = getIntEnv('INGREDIENT_LIMIT', 0, 0)
const STORE_LIMIT = getIntEnv('STORE_LIMIT', 0, 0)
const STORE_CONCURRENCY = getIntEnv('STORE_CONCURRENCY', 20, 1)
const INGREDIENT_DELAY_MS = getIntEnv('INGREDIENT_DELAY_MS', 1000, 0)
const INSERT_BATCH_SIZE = getIntEnv('INSERT_BATCH_SIZE', 500, 1)
const SCRAPER_BATCH_SIZE = getIntEnv('SCRAPER_BATCH_SIZE', 20, 1)
const SCRAPER_BATCH_CONCURRENCY = getIntEnv('SCRAPER_BATCH_CONCURRENCY', STORE_CONCURRENCY, 1)
const MAX_CONSECUTIVE_STORE_ERRORS = getIntEnv('MAX_CONSECUTIVE_STORE_ERRORS', 10, 0)
const STORE_FILTER_CONTEXT = buildStoreFilterContext({
  storeState: STORE_STATE,
  storeCity: STORE_CITY,
  storeCitiesCsv: STORE_CITIES_CSV,
  storeZipMin: STORE_ZIP_MIN,
  storeZipMax: STORE_ZIP_MAX,
})

const PAGE_SIZE = 1000

const SCRAPER_MAP = {
  walmart: scrapers.searchWalmartAPI,
  safeway: scrapers.searchSafeway,
  andronicos: scrapers.searchAndronicos,
  traderjoes: scrapers.searchTraderJoes,
  wholefoods: scrapers.searchWholeFoods,
  whole_foods: scrapers.searchWholeFoods,
  aldi: scrapers.searchAldi,
  kroger: (query, zip) => scrapers.Krogers(zip, query),
  meijer: (query, zip) => scrapers.Meijers(zip, query),
  target: (query, zip) => scrapers.getTargetProducts(query, null, zip),
  ranch99: scrapers.search99Ranch,
  '99ranch': scrapers.search99Ranch,
}

const STORE_BATCH_SCRAPER_MAP = {
  traderjoes: scrapers.searchTraderJoesBatch,
}

let supabase = null

function getSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  }

  return supabase
}

function toNonEmptyString(value) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

function parseMetadataObject(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }
  return metadata
}

function normalizeTargetStoreId(value) {
  const normalized = toNonEmptyString(value)
  if (!normalized) return null

  // Target RedSky store IDs are numeric; avoid leaking internal UUIDs through store_id aliases.
  return /^\d+$/.test(normalized) ? normalized : null
}

function resolveTargetStoreId(metadata) {
  const raw = parseMetadataObject(metadata)
  const nestedRaw = parseMetadataObject(raw.raw)

  const candidates = [
    raw.target_store_id,
    raw.targetStoreId,
    raw.store_id,
    raw.storeId,
    nestedRaw.target_store_id,
    nestedRaw.targetStoreId,
    nestedRaw.store_id,
    nestedRaw.storeId,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeTargetStoreId(candidate)
    if (normalized) return normalized
  }

  return null
}

function normalizeTargetStoreMetadata(store, fallbackZipCode = '') {
  const base = parseMetadataObject(store)
  const rawMetadata = parseMetadataObject(base.metadata ?? base.raw ?? base)
  const zipCode = normalizeZipCode(base.zip_code ?? base.zipCode ?? fallbackZipCode)
  const targetStoreId = resolveTargetStoreId({ ...rawMetadata, ...base, raw: rawMetadata })

  return {
    target_store_id: targetStoreId,
    store_id: targetStoreId, // Alias expected by target scraper resolver.
    grocery_store_id: toNonEmptyString(base.grocery_store_id ?? base.groceryStoreId ?? base.id),
    zip_code: zipCode || null,
    name: toNonEmptyString(base.name),
    address: toNonEmptyString(base.address),
    raw: rawMetadata,
  }
}

async function appendStoreFailureMetadata(store, details) {
  if (!store?.id) return

  const nowIso = new Date().toISOString()
  const storeEnum = normalizeStoreEnum(store.store_enum)
  const zipCode = normalizeZipCode(store.zip_code)
  const failureType = details.errorType || (details.skippedForErrors ? 'consecutive_errors' : 'ingredient_errors')
  const failureStatus = details.status || (details.skippedForErrors ? 'skipped_after_errors' : 'completed_with_errors')
  const summary = {
    at: nowIso,
    type: failureType,
    error_count: details.errorCount || 0,
    consecutive_error_count: details.consecutiveErrors || 0,
    threshold: MAX_CONSECUTIVE_STORE_ERRORS,
    message: truncateText(details.lastErrorMessage || 'Unknown scraper error'),
    store_enum: storeEnum || null,
    zip_code: zipCode || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
  }

  const failedScrapePayload = {
    store: {
      id: store.id,
      store_enum: storeEnum || null,
      zip_code: zipCode || null,
    },
    failure: summary,
    details: {
      status: failureStatus,
      error_type: failureType,
      store_city: STORE_CITY || null,
      store_state: STORE_STATE || null,
      store_limit: STORE_LIMIT,
      ingredient_limit: INGREDIENT_LIMIT,
    },
  }

  const { error: logInsertError } = await getSupabase()
    .from('failed_scrapes_log')
    .insert({
      raw_payload: failedScrapePayload,
      error_code: failureType,
      error_detail: summary.message,
    })

  if (logInsertError) {
    console.error(`❌ Failed inserting failed_scrapes_log row for store ${store.id}: ${logInsertError.message}`)
    return
  }

  console.log(`   📝 Logged failed scrape row for store ${storeEnum} (${zipCode || 'no-zip'}) id=${store.id}`)
}

async function appendStoreHttp404Metadata(store, details) {
  if (!store?.id) return

  const nowIso = new Date().toISOString()
  const storeEnum = normalizeStoreEnum(store.store_enum)
  const zipCode = normalizeZipCode(store.zip_code)
  const existingMetadata = parseMetadataObject(store.metadata)
  const existingScraperRuntime = parseMetadataObject(existingMetadata.scraper_runtime)
  const existing404Events = Array.isArray(existingScraperRuntime.http_404_events)
    ? existingScraperRuntime.http_404_events
    : []

  const event = {
    at: nowIso,
    store_enum: storeEnum || null,
    zip_code: zipCode || null,
    ingredient: toNonEmptyString(details.ingredientName),
    error_code: toNonEmptyString(details.errorCode) || 'HTTP_404',
    message: truncateText(details.message || 'Scraper returned HTTP 404'),
    run_id: process.env.GITHUB_RUN_ID || null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
  }

  const nextMetadata = {
    ...existingMetadata,
    scraper_runtime: {
      ...existingScraperRuntime,
      last_http_404: event,
      // Keep recent history bounded to avoid unbounded metadata growth.
      http_404_events: [event, ...existing404Events].slice(0, 10),
      stop_reason: 'http_404',
      stop_at: nowIso,
    },
  }

  const { error } = await getSupabase()
    .from('grocery_stores')
    .update({ metadata: nextMetadata })
    .eq('id', store.id)

  if (error) {
    console.error(`❌ Failed to persist HTTP 404 metadata for store ${store.id}: ${error.message}`)
    return
  }

  // Keep in-memory copy aligned in case this store object is reused.
  store.metadata = nextMetadata
  console.log(`   📝 Updated grocery_stores.metadata with HTTP 404 event for ${storeEnum} (${zipCode || 'no-zip'})`)
}

async function appendBrandFailureMetadata(storeEnum, details) {
  if (!storeEnum) return

  console.warn(`⚠️ Recording fatal scraper failure logs for brand "${storeEnum}"...`)

  let query = getSupabase()
    .from('grocery_stores')
    .select('id, store_enum, zip_code')
    .eq('store_enum', storeEnum)
    .eq('is_active', true)
  query = applyStoreRangeFilters(query, STORE_FILTER_CONTEXT)

  const { data, error } = await query
  if (error) {
    console.error(`❌ Failed to fetch stores for fatal failure-log update (${storeEnum}): ${error.message}`)
    return
  }

  const storesToMark = (data || []).slice(0, STORE_LIMIT > 0 ? STORE_LIMIT : undefined)
  for (const store of storesToMark) {
    await appendStoreFailureMetadata(store, details)
  }
}

async function fetchStores(storeBrand = null) {
  console.log('📍 Fetching grocery stores for scraper...')
  if (hasStoreRangeFilters(STORE_FILTER_CONTEXT)) {
    console.log(`🔎 Store filters: ${formatStoreFilterSummary(STORE_FILTER_CONTEXT)}`)
  }

  const allStores = []
  let offset = 0
  const normalizedBrand = storeBrand ? normalizeStoreEnum(storeBrand) : null

  while (true) {
    let query = getSupabase()
      .from('grocery_stores')
      .select('id, store_enum, zip_code, address, name, metadata')
      .not('zip_code', 'is', null)
      .eq('is_active', true)
      .order('store_enum', { ascending: true })
      .order('zip_code', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (normalizedBrand) {
      query = query.eq('store_enum', normalizedBrand)
    }

    query = applyStoreRangeFilters(query, STORE_FILTER_CONTEXT)

    const { data, error } = await query
    if (error) {
      console.error('❌ Error fetching stores:', error.message)
      throw error
    }

    const pageStores = (data || []).filter(row => row.zip_code)
    allStores.push(...pageStores)

    if (!data || data.length < PAGE_SIZE) {
      break
    }

    offset += PAGE_SIZE
  }

  const normalizedStores = allStores
    .map(store => ({
      ...store,
      zip_code: normalizeZipCode(store.zip_code),
    }))
    .filter(store => store.zip_code)

  const stores = STORE_LIMIT > 0 ? normalizedStores.slice(0, STORE_LIMIT) : normalizedStores
  console.log(`✅ Found ${stores.length} stores with valid ZIP codes`)
  return stores
}

async function fetchAllCanonicalIngredients() {
  console.log('📚 Fetching canonical ingredients...')

  const allIngredients = []
  let offset = 0

  while (true) {
    const { data, error } = await getSupabase()
      .from('standardized_ingredients')
      .select('canonical_name')
      .not('canonical_name', 'is', null)
      .order('canonical_name', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      console.error('❌ Error fetching ingredients:', error.message)
      throw error
    }

    const names = (data || [])
      .map(row => row.canonical_name)
      .filter(name => typeof name === 'string' && name.trim().length > 0)
      .map(name => name.trim())

    allIngredients.push(...names)

    if (!data || data.length < PAGE_SIZE) {
      break
    }

    offset += PAGE_SIZE
  }

  const uniqueIngredients = [...new Set(allIngredients)]
  const ingredients = INGREDIENT_LIMIT > 0 ? uniqueIngredients.slice(0, INGREDIENT_LIMIT) : uniqueIngredients
  console.log(`✅ Found ${ingredients.length} canonical ingredients`)
  return ingredients
}

async function runBatchedScraperForStore(storeEnum, ingredientChunk, zipCode, batchConcurrency, scrapeStats = null, storeMetadata = null) {
  const nativeBatchScraper = STORE_BATCH_SCRAPER_MAP[storeEnum]
  const normalizedTargetMetadata =
    storeEnum === 'target' ? normalizeTargetStoreMetadata(storeMetadata, zipCode) : null

  if (typeof nativeBatchScraper === 'function') {
    try {
      const nativeResults = await nativeBatchScraper(ingredientChunk, zipCode, {
        concurrency: batchConcurrency,
      })
      return {
        resultsByIngredient: normalizeBatchResultsShape(nativeResults, ingredientChunk.length),
        errorFlags: Array.from({ length: ingredientChunk.length }, () => false),
        errorMessages: Array.from({ length: ingredientChunk.length }, () => ''),
        http404Flags: Array.from({ length: ingredientChunk.length }, () => false),
        errorCodes: Array.from({ length: ingredientChunk.length }, () => ''),
      }
    } catch (error) {
      const message = error?.message || String(error)
      const code = String(error?.code || '')
      const isRateLimitFailure =
        code.toLowerCase().includes('rate_limit') ||
        code.toLowerCase().includes('429') ||
        message.toLowerCase().includes('429') ||
        message.toLowerCase().includes('rate limit')

      if (isRateLimitFailure) {
        console.warn(
          `⚠️ Native batch scraper rate-limited for ${storeEnum}: ${message}. ` +
          'Marking chunk as errors to avoid retry storms.'
        )
        return {
          resultsByIngredient: emptyBatchResults(ingredientChunk.length),
          errorFlags: Array.from({ length: ingredientChunk.length }, () => true),
          errorMessages: Array.from({ length: ingredientChunk.length }, () => message),
          http404Flags: Array.from({ length: ingredientChunk.length }, () => false),
          errorCodes: Array.from({ length: ingredientChunk.length }, () => code.toUpperCase()),
        }
      }

      console.warn(`⚠️ Native batch scraper failed for ${storeEnum}: ${message}. Falling back to chunked single calls.`)
    }
  }

  const singleScraper = SCRAPER_MAP[storeEnum]
  if (typeof singleScraper !== 'function') {
    console.warn(`⚠️ No scraper configured for "${storeEnum}"`)
    return {
      resultsByIngredient: emptyBatchResults(ingredientChunk.length),
      errorFlags: Array.from({ length: ingredientChunk.length }, () => true),
      errorMessages: Array.from({ length: ingredientChunk.length }, () => `No scraper configured for ${storeEnum}`),
      http404Flags: Array.from({ length: ingredientChunk.length }, () => false),
      errorCodes: Array.from({ length: ingredientChunk.length }, () => 'SCRAPER_NOT_CONFIGURED'),
    }
  }

  const chunkResults = await mapWithConcurrency(
    ingredientChunk,
    batchConcurrency,
    async ingredientName => {
      try {
        // Special handling for Target to pass store metadata
        if (storeEnum === 'target') {
          console.log(
            `[DEBUG] Target scrape for ${ingredientName}: ` +
            `target_store_id=${normalizedTargetMetadata?.target_store_id || 'none'}, ` +
            `grocery_store_id=${normalizedTargetMetadata?.grocery_store_id || 'none'}, zip=${zipCode}`
          )
        }
        const results = storeEnum === 'target'
          ? await scrapers.getTargetProducts(ingredientName, normalizedTargetMetadata, zipCode)
          : await singleScraper(ingredientName, zipCode)

        return {
          results: results,
          hadError: false,
          errorMessage: '',
          isHttp404: false,
          errorCode: '',
        }
      } catch (error) {
        const message = error?.message || String(error)
        const status = error?.status ?? error?.response?.status
        const code = String(error?.code || '').toUpperCase()
        const isTarget404 = storeEnum === 'target' && (status === 404 || code === 'TARGET_HTTP_404')
        const isHttp404 = status === 404 || code.includes('404')

        if (isTarget404) {
          console.warn(
            `⚠️ Target 404 for ${storeEnum} (${zipCode}) ingredient "${ingredientName}" - stopping this store scrape`
          )

          // Track for summary
          if (scrapeStats && scrapeStats.target404s) {
            scrapeStats.target404s.push({ storeEnum, zipCode, ingredientName, timestamp: new Date().toISOString() })
          }
        }

        if (isHttp404) {
          return {
            results: [],
            hadError: true,
            errorMessage: message,
            isHttp404: true,
            errorCode: code || 'HTTP_404',
          }
        }

        console.error(`❌ Scraper failed for ${storeEnum} (${zipCode}) ingredient "${ingredientName}": ${message}`)
        return {
          results: [],
          hadError: true,
          errorMessage: message,
          isHttp404: false,
          errorCode: code || '',
        }
      }
    }
  )

  return {
    resultsByIngredient: chunkResults.map(entry => normalizeResultsShape(entry?.results)),
    errorFlags: chunkResults.map(entry => Boolean(entry?.hadError)),
    errorMessages: chunkResults.map(entry => truncateText(entry?.errorMessage || '')),
    http404Flags: chunkResults.map(entry => Boolean(entry?.isHttp404)),
    errorCodes: chunkResults.map(entry => truncateText(entry?.errorCode || '')),
  }
}

async function scrapeIngredientsAndInsertBatched(ingredients, stores) {
  const pendingResults = []
  let totalScrapedCount = 0
  let totalInsertedCount = 0
  let skippedStoreCount = 0
  const scrapeStats = {
    target404s: []
  }

  async function flushPendingResults(force = false, reason = 'buffer checkpoint') {
    if (!pendingResults.length) return

    if (!force && pendingResults.length < INSERT_BATCH_SIZE) {
      return
    }

    while (pendingResults.length >= INSERT_BATCH_SIZE || (force && pendingResults.length > 0)) {
      const take = pendingResults.length >= INSERT_BATCH_SIZE
        ? INSERT_BATCH_SIZE
        : pendingResults.length
      const batch = pendingResults.splice(0, take)
      console.log(`💾 Flushing ${batch.length} buffered items (${reason})`)
      const inserted = await bulkInsertIngredientHistory(batch)
      totalInsertedCount += inserted

      if (pendingResults.length > 0) {
        await sleep(1000)
      }
    }
  }

  for (let storeIndex = 0; storeIndex < stores.length; storeIndex += 1) {
    const store = stores[storeIndex]
    const storeEnum = normalizeStoreEnum(store.store_enum)
    const zipCode = normalizeZipCode(store.zip_code)
    const batchSize = SCRAPER_BATCH_SIZE
    const batchConcurrency = SCRAPER_BATCH_CONCURRENCY
    let consecutiveStoreErrors = 0
    let totalStoreErrors = 0
    let skippedForErrors = false
    let stopReason = ''
    let lastErrorMessage = ''

    if (!zipCode) {
      console.warn(`⚠️ Skipping store ${storeEnum} (${store.id || 'unknown-id'}) due to invalid zip_code`)
      continue
    }

    console.log(`\n🏬 Store ${storeIndex + 1}/${stores.length}: ${storeEnum} (${zipCode || 'no-zip'})`)
    console.log(`   ⚙️ Batch size: ${batchSize}, concurrency: ${batchConcurrency}`)
    const normalizedTargetMetadata =
      storeEnum === 'target' ? normalizeTargetStoreMetadata(store, zipCode) : null

    for (let i = 0; i < ingredients.length; i += batchSize) {
      const chunk = ingredients.slice(i, i + batchSize)
      const chunkLabel = `${i + 1}-${Math.min(i + chunk.length, ingredients.length)}`
      console.log(`   📦 Batched ingredients ${chunkLabel}/${ingredients.length}`)

      if (storeEnum === 'target') {
        console.log(`[DEBUG] Calling runBatchedScraperForStore with metadata:`, JSON.stringify(normalizedTargetMetadata))
      }

      const { resultsByIngredient, errorFlags, errorMessages, http404Flags, errorCodes } = await runBatchedScraperForStore(
        storeEnum,
        chunk,
        zipCode,
        batchConcurrency,
        scrapeStats,
        normalizedTargetMetadata
      )

      let chunkHits = 0
      for (let idx = 0; idx < chunk.length; idx += 1) {
        const ingredientName = chunk[idx]

        if (http404Flags[idx]) {
          totalStoreErrors += 1
          consecutiveStoreErrors += 1
          stopReason = 'http_404'
          lastErrorMessage = errorMessages[idx] || `HTTP 404 for ${storeEnum} (${zipCode}) ingredient "${ingredientName}"`
          skippedForErrors = true

          await appendStoreHttp404Metadata(store, {
            ingredientName,
            errorCode: errorCodes[idx],
            message: lastErrorMessage,
          })
          break
        }

        if (errorFlags[idx]) {
          consecutiveStoreErrors += 1
          totalStoreErrors += 1
          if (errorMessages[idx]) {
            lastErrorMessage = errorMessages[idx]
          }

          if (MAX_CONSECUTIVE_STORE_ERRORS > 0 && consecutiveStoreErrors > MAX_CONSECUTIVE_STORE_ERRORS) {
            skippedForErrors = true
            stopReason = 'consecutive_errors'
            break
          }

          continue
        }

        consecutiveStoreErrors = 0

        const best = pickBestResult(resultsByIngredient[idx] || [])
        if (!best) continue

        pendingResults.push({
          store: storeEnum,
          price: best._price,
          imageUrl: best.image_url || best.imageUrl || null,
          productName: getProductName(best, ingredientName),
          productId: best.product_id || best.id || null,
          zipCode,
          store_id: store.id || null,
          rawUnit: best.rawUnit || best.unit || best.size || null,
          unit: best.unit || null
        })

        totalScrapedCount += 1
        chunkHits += 1
      }

      console.log(`   ✅ Found ${chunkHits}/${chunk.length} prices in chunk`)
      await flushPendingResults(false, `threshold reached at ${storeEnum} (${zipCode})`)

      if (skippedForErrors) {
        skippedStoreCount += 1
        if (stopReason === 'http_404') {
          console.warn(
            `   ⏭️ Stopping scrape for ${storeEnum} (${zipCode}) immediately after HTTP 404 ` +
            `and skipping remaining ingredients for this store.`
          )
        } else {
          console.warn(
            `   ⏭️ Skipping remaining ingredients for ${storeEnum} (${zipCode}) after ` +
            `${consecutiveStoreErrors} consecutive scraper errors (threshold: ${MAX_CONSECUTIVE_STORE_ERRORS}).`
          )
        }
        break
      }

      if (i + batchSize < ingredients.length && INGREDIENT_DELAY_MS > 0) {
        await sleep(INGREDIENT_DELAY_MS)
      }
    }

    if (totalStoreErrors > 0) {
      await appendStoreFailureMetadata(store, {
        errorCount: totalStoreErrors,
        consecutiveErrors: consecutiveStoreErrors,
        skippedForErrors,
        lastErrorMessage,
        errorType: stopReason === 'http_404' ? 'http_404' : undefined,
        status: stopReason === 'http_404' ? 'skipped_after_http_404' : undefined,
      })
    }

    await flushPendingResults(true, `store completed: ${storeEnum} (${zipCode})`)
  }

  if (skippedStoreCount > 0) {
    console.warn(`\n⚠️ Skipped ${skippedStoreCount} store location(s) due to scraper stop conditions.`)
  }

  await flushPendingResults(true, 'final run completion')

  return {
    scrapedCount: totalScrapedCount,
    insertedCount: totalInsertedCount,
    scrapeStats,
  }
}

async function bulkInsertIngredientHistory(items) {
  if (!items || items.length === 0) {
    console.log('⚠️  No items to insert')
    return 0
  }

  const payload = items
    .map(item => ({
      store: normalizeStoreEnum(item.store),
      price: toPriceNumber(item.price),
      imageUrl: item.imageUrl ?? null,
      productName: (item.productName || '').toString().trim() || null,
      productId: item.productId == null ? null : String(item.productId),
      zipCode: normalizeZipCode(item.zipCode),
      store_id: item.store_id ?? null,
      rawUnit: item.rawUnit ?? item.unit ?? null,
      unit: item.unit ?? null
    }))
    .filter(item => item.price !== null && item.price > 0 && item.productName && item.zipCode)

  if (!payload.length) {
    console.warn('⚠️  No valid payload rows after normalization')
    return 0
  }

  console.log(`💾 Inserting ${payload.length} items via RPC...`)

  const { data, error } = await getSupabase().rpc('fn_bulk_insert_ingredient_history', {
    p_items: payload
  })

  if (error) {
    console.error('❌ RPC error:', error.message)
    throw error
  }

  const insertedCount = Array.isArray(data)
    ? data.length
    : (typeof data === 'number' ? data : (data?.inserted_count ?? 0))

  console.log(`✅ Inserted ${insertedCount} rows`)
  return insertedCount
}

async function main() {
  const startTime = Date.now()

  console.log('🚀 Daily Ingredient Scraper Starting...')
  console.log(`   Store Brand: ${STORE_BRAND || 'ALL'}`)
  console.log(`   Strategy: Direct RPC + store-batched scraping`)
  console.log(`   Store Concurrency: ${STORE_CONCURRENCY}`)
  console.log(`   Default Batch Size: ${SCRAPER_BATCH_SIZE}`)
  console.log(`   Default Batch Concurrency: ${SCRAPER_BATCH_CONCURRENCY}`)
  console.log(`   Max Consecutive Store Errors: ${MAX_CONSECUTIVE_STORE_ERRORS > 0 ? MAX_CONSECUTIVE_STORE_ERRORS : 'disabled'}`)
  console.log(`   Insert Batch Size: ${INSERT_BATCH_SIZE}`)

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const stores = await fetchStores(STORE_BRAND)
  if (!stores.length) {
    if (STORE_BRAND) {
      console.warn(`⚠️  No stores found for "${STORE_BRAND}" with current filters, skipping job`)
      return
    }

    console.error('❌ No stores found for configured filters')
    process.exit(1)
  }

  const ingredients = await fetchAllCanonicalIngredients()
  if (!ingredients.length) {
    console.error('❌ No canonical ingredients found')
    process.exit(1)
  }

  const { scrapedCount, insertedCount, scrapeStats } = await scrapeIngredientsAndInsertBatched(ingredients, stores)
  console.log(`\n✅ Scraped ${scrapedCount} total products`)
  const inserted = insertedCount
  console.log(`\n✅ Inserted ${inserted} rows to database`)

  const duration = (Date.now() - startTime) / 1000
  const successRate = scrapedCount > 0 ? (inserted / scrapedCount) * 100 : 0

  console.log('\n' + '='.repeat(60))
  console.log('📊 SCRAPER SUMMARY')
  console.log('='.repeat(60))
  console.log(`Store Brand: ${STORE_BRAND || 'ALL'}`)
  console.log(`Stores: ${stores.length}`)
  console.log(`Ingredients: ${ingredients.length}`)
  console.log(`Scraped: ${scrapedCount}`)
  console.log(`Inserted: ${inserted}`)
  console.log(`Success Rate: ${successRate.toFixed(1)}%`)
  console.log(`Duration: ${duration.toFixed(1)}s`)
  console.log('='.repeat(60))

  // Print 404 summary if there were any Target 404s
  if (scrapeStats?.target404s?.length > 0) {
    console.log(`\n🔍 TARGET 404 SUMMARY: ${scrapeStats.target404s.length} total`)

    // Group by store/ZIP
    const byStore = scrapeStats.target404s.reduce((acc, e) => {
      const key = `${e.storeEnum}|${e.zipCode}`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    // Group by ingredient
    const byIngredient = scrapeStats.target404s.reduce((acc, e) => {
      acc[e.ingredientName] = (acc[e.ingredientName] || 0) + 1
      return acc
    }, {})

    console.log('\nTop 404 Stores/ZIPs:')
    Object.entries(byStore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([k, c]) => console.log(`  ${k}: ${c}`))

    console.log('\nTop 404 Ingredients:')
    Object.entries(byIngredient)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([k, c]) => console.log(`  ${k}: ${c}`))
  }

  if (inserted < scrapedCount * 0.2) {
    console.error('\n❌ CRITICAL: <20% insertion success rate')
    process.exit(1)
  }
}

let shutdownSignalHandled = false

async function handleTerminationSignal(signal) {
  if (shutdownSignalHandled) return
  shutdownSignalHandled = true

  console.error(`\n⚠️ Received ${signal}; recording scraper failure logs before exit...`)

  const normalizedBrand = normalizeStoreEnum(STORE_BRAND)
  if (normalizedBrand && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    await appendBrandFailureMetadata(normalizedBrand, {
      errorCount: 1,
      consecutiveErrors: 1,
      skippedForErrors: false,
      lastErrorMessage: `Process terminated by ${signal}`,
      errorType: 'process_terminated',
      status: 'run_failed',
    })
  }

  process.exit(1)
}

process.on('SIGTERM', () => {
  void handleTerminationSignal('SIGTERM')
})

process.on('SIGINT', () => {
  void handleTerminationSignal('SIGINT')
})

main().catch(async error => {
  console.error('\n💥 Fatal error:', error)

  const fatalMessage = error?.message || String(error)
  const normalizedBrand = normalizeStoreEnum(STORE_BRAND)
  if (normalizedBrand) {
    await appendBrandFailureMetadata(normalizedBrand, {
      errorCount: 1,
      consecutiveErrors: 1,
      skippedForErrors: false,
      lastErrorMessage: fatalMessage,
      errorType: 'run_failure',
      status: 'run_failed',
    })
  }

  process.exit(1)
})
