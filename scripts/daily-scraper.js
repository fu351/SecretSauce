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
  getBooleanEnv,
  getIntEnv,
  getProductName,
  hasStoreRangeFilters,
  mapWithConcurrency,
  normalizeBatchResultsShape,
  normalizeResultsShape,
  normalizeStoreEnum,
  normalizeZipCode,
  sleep,
  toPriceNumber,
  truncateText,
} from './utils/daily-scraper-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const scrapers = require('../scrapers')

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
const DAILY_SCRAPER_DRY_RUN = getBooleanEnv('DAILY_SCRAPER_DRY_RUN', getBooleanEnv('DRY_RUN', false))
const SUMMARY_MODE = String(process.env.DAILY_SCRAPER_SUMMARY_MODE || 'basic').trim().toLowerCase() === 'detailed'
  ? 'detailed'
  : 'basic'

const INGREDIENT_LIMIT = getIntEnv('INGREDIENT_LIMIT', 0, 0)
const STORE_LIMIT = getIntEnv('STORE_LIMIT', 0, 0)
const STORE_CONCURRENCY = getIntEnv('STORE_CONCURRENCY', 20, 1)
const INGREDIENT_DELAY_MS = getIntEnv('INGREDIENT_DELAY_MS', 1000, 0)
const INSERT_BATCH_SIZE = getIntEnv('INSERT_BATCH_SIZE', 300, 1)
const INSERT_CONCURRENCY = getIntEnv('INSERT_CONCURRENCY', 1, 1)
const INSERT_QUEUE_MAX_SIZE = getIntEnv('INSERT_QUEUE_MAX_SIZE', 0, 0)
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
  kroger: (query, zip) => scrapers.searchKroger(zip, query),
  meijer: (query, zip) => scrapers.searchMeijer(zip, query),
  target: (query, zip) => scrapers.searchTarget(query, null, zip),
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

function normalizeProductNameForDedupe(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function buildInsertDedupKey(item) {
  const store = normalizeStoreEnum(item?.store)
  const zipCode = normalizeZipCode(item?.zipCode)
  const productId = toNonEmptyString(item?.productId)

  if (productId) {
    return `${store}|${zipCode}|id|${productId}`
  }

  const productName = normalizeProductNameForDedupe(item?.productName)
  const price = toPriceNumber(item?.price)
  if (!productName || price === null) {
    return ''
  }

  return `${store}|${zipCode}|name|${productName}|price|${price.toFixed(2)}`
}

async function appendStoreFailureMetadata(store, details) {
  if (DAILY_SCRAPER_DRY_RUN) {
    console.log(
      `   [DRY RUN] Skipping failed_scrapes_log write for ${normalizeStoreEnum(store?.store_enum)} (${normalizeZipCode(store?.zip_code) || 'no-zip'})`
    )
    return
  }

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
  if (DAILY_SCRAPER_DRY_RUN) {
    console.log(
      `   [DRY RUN] Skipping grocery_stores metadata update for ${normalizeStoreEnum(store?.store_enum)} (${normalizeZipCode(store?.zip_code) || 'no-zip'})`
    )
    return
  }

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
  const normalizedTargetMetadata = storeEnum === 'target' ? storeMetadata : null

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
      const normalizedCode = code.toLowerCase()
      const normalizedMessage = message.toLowerCase()
      const isRateLimitFailure =
        normalizedCode.includes('rate_limit') ||
        normalizedCode.includes('cooldown') ||
        normalizedCode.includes('429') ||
        normalizedCode.includes('jina') ||
        normalizedMessage.includes('429') ||
        normalizedMessage.includes('rate limit') ||
        normalizedMessage.includes('cooldown active') ||
        normalizedMessage.includes('jina cooldown')

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
        const results = storeEnum === 'target'
          ? await scrapers.searchTarget(ingredientName, normalizedTargetMetadata, zipCode)
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
        const isFatalAuthBlocked = code === 'KROGER_AUTH_BLOCKED' || code === 'KROGER_AUTH_MISSING_CREDS'

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
        if (isFatalAuthBlocked) {
          return {
            results: [],
            hadError: true,
            errorMessage: message,
            isHttp404: false,
            errorCode: code,
          }
        }

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

class GlobalInsertQueue {
  constructor({ batchSize, maxQueueSize, insertConcurrency }) {
    this._queue = []
    this._batchSize = batchSize
    this._maxQueueSize = maxQueueSize
    this._insertConcurrency = insertConcurrency
    this._totalInserted = 0
    this._drainError = null
    this._activeInserts = 0
    this._backpressureWaiters = []
    this._concurrencyWaiters = []
    this._inFlightKeys = new Set()
    this._totalDeduped = 0
  }

  async push(items) {
    if (this._drainError) throw this._drainError
    const uniqueItems = []

    for (const item of items) {
      const dedupeKey = buildInsertDedupKey(item)
      if (dedupeKey && this._inFlightKeys.has(dedupeKey)) {
        this._totalDeduped += 1
        continue
      }

      if (dedupeKey) {
        this._inFlightKeys.add(dedupeKey)
      }

      uniqueItems.push({
        ...item,
        _dedupeKey: dedupeKey,
      })
    }

    if (uniqueItems.length === 0) {
      return
    }

    const skippedCount = items.length - uniqueItems.length
    if (skippedCount > 0) {
      console.log(`   🔁 Skipped ${skippedCount} in-flight duplicate item(s) before queueing`)
    }

    if (this._maxQueueSize > 0) {
      while (this._queue.length + uniqueItems.length > this._maxQueueSize) {
        await new Promise(resolve => this._backpressureWaiters.push(resolve))
        if (this._drainError) throw this._drainError
      }
    }
    this._queue.push(...uniqueItems)
    this._maybeFlush()
  }

  async drain() {
    // Flush all remaining full batches
    this._maybeFlush()
    // Flush tail (items < batchSize)
    while (this._queue.length > 0 || this._activeInserts > 0) {
      if (this._queue.length > 0 && this._activeInserts < this._insertConcurrency) {
        const batch = this._queue.splice(0, this._queue.length)
        this._runInsert(batch)
      } else {
        await new Promise(resolve => this._concurrencyWaiters.push(resolve))
      }
      if (this._drainError) throw this._drainError
    }
  }

  get totalInserted() {
    return this._totalInserted
  }

  get totalDeduped() {
    return this._totalDeduped
  }

  _maybeFlush() {
    while (
      this._queue.length >= this._batchSize &&
      this._activeInserts < this._insertConcurrency
    ) {
      const batch = this._queue.splice(0, this._batchSize)
      this._runInsert(batch)
    }
    this._notifyBackpressureWaiters()
  }

  _runInsert(batch) {
    this._activeInserts += 1
    bulkInsertIngredientHistory(batch)
      .then(inserted => { this._totalInserted += inserted })
      .catch(err => {
        if (!this._drainError) this._drainError = err
        this._notifyBackpressureWaiters()
        this._notifyConcurrencyWaiters()
      })
      .finally(() => {
        for (const item of batch) {
          if (item?._dedupeKey) {
            this._inFlightKeys.delete(item._dedupeKey)
          }
        }
        this._activeInserts -= 1
        this._notifyConcurrencyWaiters()
        this._maybeFlush()
      })
  }

  _notifyBackpressureWaiters() {
    if (!this._backpressureWaiters.length) return
    if (this._drainError || !this._maxQueueSize || this._queue.length < this._maxQueueSize) {
      const waiters = this._backpressureWaiters.splice(0)
      for (const resolve of waiters) resolve()
    }
  }

  _notifyConcurrencyWaiters() {
    if (!this._concurrencyWaiters.length) return
    if (this._drainError || this._activeInserts < this._insertConcurrency) {
      const waiters = this._concurrencyWaiters.splice(0)
      for (const resolve of waiters) resolve()
    }
  }
}

async function scrapeIngredientsAndInsertBatched(ingredients, stores) {
  let skippedStoreCount = 0
  const scrapeStats = { target404s: [], stores: [] }

  const insertQueue = new GlobalInsertQueue({
    batchSize: INSERT_BATCH_SIZE,
    maxQueueSize: INSERT_QUEUE_MAX_SIZE,
    insertConcurrency: INSERT_CONCURRENCY,
  })

  async function processStore(store, storeIndex) {
    let localScrapedCount = 0
    let localChunkCount = 0
    let localIngredientsAttempted = 0
    let localIngredientsWithHits = 0
    const storeStartTime = Date.now()

    const storeEnum = normalizeStoreEnum(store.store_enum)
    const zipCode = normalizeZipCode(store.zip_code)
    const batchSize = SCRAPER_BATCH_SIZE
    const batchConcurrency = SCRAPER_BATCH_CONCURRENCY
    let consecutiveStoreErrors = 0
    let totalStoreErrors = 0
    let skippedForErrors = false
    let stopReason = ''
    let lastErrorMessage = ''
    const storeTarget404s = []

    if (!zipCode) {
      console.warn(`⚠️ Skipping store ${storeEnum} (${store.id || 'unknown-id'}) due to invalid zip_code`)
      return { scrapedCount: 0, skippedForErrors: false, target404s: [] }
    }

    console.log(`\n🏬 Store ${storeIndex + 1}/${stores.length}: ${storeEnum} (${zipCode || 'no-zip'})`)
    console.log(`   ⚙️ Batch size: ${batchSize}, concurrency: ${batchConcurrency}`)
    const normalizedTargetMetadata =
      storeEnum === 'target' ? normalizeTargetStoreMetadata(store, zipCode) : null

    for (let i = 0; i < ingredients.length; i += batchSize) {
      const chunk = ingredients.slice(i, i + batchSize)
      const chunkLabel = `${i + 1}-${Math.min(i + chunk.length, ingredients.length)}`
      console.log(`   📦 Batched ingredients ${chunkLabel}/${ingredients.length}`)

      const localScrapeStats = { target404s: storeTarget404s }
      const { resultsByIngredient, errorFlags, errorMessages, http404Flags, errorCodes } = await runBatchedScraperForStore(
        storeEnum,
        chunk,
        zipCode,
        batchConcurrency,
        localScrapeStats,
        normalizedTargetMetadata
      )
      localChunkCount += 1

      let chunkPriceHits = 0
      let chunkIngredientHits = 0
      for (let idx = 0; idx < chunk.length; idx += 1) {
        const ingredientName = chunk[idx]
        localIngredientsAttempted += 1

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

          if (errorCodes[idx] === 'KROGER_AUTH_BLOCKED' || errorCodes[idx] === 'KROGER_AUTH_MISSING_CREDS') {
            skippedForErrors = true
            stopReason = 'auth_blocked'
            break
          }

          if (MAX_CONSECUTIVE_STORE_ERRORS > 0 && consecutiveStoreErrors > MAX_CONSECUTIVE_STORE_ERRORS) {
            skippedForErrors = true
            stopReason = 'consecutive_errors'
            break
          }

          continue
        }

        consecutiveStoreErrors = 0

        const validResults = (resultsByIngredient[idx] || [])
          .map(item => ({ ...item, _price: toPriceNumber(item?.price) }))
          .filter(item => item._price !== null && item._price >= 0)

        if (validResults.length === 0) continue
        chunkIngredientHits += 1
        localIngredientsWithHits += 1

        const itemsToQueue = validResults.map(result => ({
          store: storeEnum,
          price: result._price,
          imageUrl: result.image_url || result.imageUrl || null,
          productName: getProductName(result, ingredientName),
          productId: result.product_id || result.id || null,
          zipCode,
          store_id: store.id || null,
          rawUnit: result.rawUnit || result.unit || result.size || null,
          unit: result.unit || null,
        }))
        await insertQueue.push(itemsToQueue)
        localScrapedCount += itemsToQueue.length
        chunkPriceHits += validResults.length
      }

      console.log(
        `   ✅ Found ${chunkPriceHits} prices across ${chunkIngredientHits}/${chunk.length} ingredients in chunk`
      )
      if (skippedForErrors) {
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
        errorType:
          stopReason === 'http_404'
            ? 'http_404'
            : (stopReason === 'auth_blocked' ? 'auth_blocked' : undefined),
        status:
          stopReason === 'http_404'
            ? 'skipped_after_http_404'
            : (stopReason === 'auth_blocked' ? 'skipped_after_auth_blocked' : undefined),
      })
    }

    return {
      storeEnum,
      storeId: store.id || null,
      zipCode,
      durationMs: Date.now() - storeStartTime,
      chunkCount: localChunkCount,
      ingredientsAttempted: localIngredientsAttempted,
      ingredientsWithHits: localIngredientsWithHits,
      errorCount: totalStoreErrors,
      stopReason,
      lastErrorMessage: lastErrorMessage || '',
      scrapedCount: localScrapedCount,
      skippedForErrors,
      target404s: storeTarget404s,
    }
  }

  const storeResults = await mapWithConcurrency(stores, STORE_CONCURRENCY, processStore)

  await insertQueue.drain()

  let totalScrapedCount = 0
  const totalInsertedCount = insertQueue.totalInserted
  const totalDedupedCount = insertQueue.totalDeduped
  for (const result of storeResults) {
    if (!result) continue
    totalScrapedCount += result.scrapedCount
    if (result.skippedForErrors) skippedStoreCount += 1
    scrapeStats.target404s.push(...result.target404s)
    scrapeStats.stores.push({
      storeEnum: result.storeEnum,
      storeId: result.storeId,
      zipCode: result.zipCode,
      durationMs: result.durationMs,
      chunkCount: result.chunkCount,
      ingredientsAttempted: result.ingredientsAttempted,
      ingredientsWithHits: result.ingredientsWithHits,
      scrapedCount: result.scrapedCount,
      errorCount: result.errorCount,
      skippedForErrors: result.skippedForErrors,
      stopReason: result.stopReason,
      lastErrorMessage: result.lastErrorMessage,
      target404Count: result.target404s.length,
    })
  }

  if (skippedStoreCount > 0) {
    console.warn(`\n⚠️ Skipped ${skippedStoreCount} store location(s) due to scraper stop conditions.`)
  }

  return {
    scrapedCount: totalScrapedCount,
    insertedCount: totalInsertedCount,
    dedupedCount: totalDedupedCount,
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
    .filter(item => item.price !== null && item.price >= 0 && item.productName && item.zipCode)

  if (!payload.length) {
    console.warn('⚠️  No valid payload rows after normalization')
    return 0
  }

  if (DAILY_SCRAPER_DRY_RUN) {
    console.log(`[DRY RUN] Would insert ${payload.length} items via fn_bulk_insert_ingredient_history`)
    return payload.length
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
  console.log(`   Dry Run: ${DAILY_SCRAPER_DRY_RUN ? 'true' : 'false'}`)
  console.log(`   Summary Mode: ${SUMMARY_MODE}`)
  console.log(`   Strategy: Direct RPC + store-batched scraping`)
  console.log(`   Store Concurrency: ${STORE_CONCURRENCY}`)
  console.log(`   Default Batch Size: ${SCRAPER_BATCH_SIZE}`)
  console.log(`   Default Batch Concurrency: ${SCRAPER_BATCH_CONCURRENCY}`)
  console.log(`   Max Consecutive Store Errors: ${MAX_CONSECUTIVE_STORE_ERRORS > 0 ? MAX_CONSECUTIVE_STORE_ERRORS : 'disabled'}`)
  console.log(`   Insert Batch Size: ${INSERT_BATCH_SIZE}`)
  console.log(`   Insert Concurrency: ${INSERT_CONCURRENCY}`)
  console.log(`   Insert Queue Max: ${INSERT_QUEUE_MAX_SIZE > 0 ? INSERT_QUEUE_MAX_SIZE : 'unlimited'}`)

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

  const { scrapedCount, insertedCount, dedupedCount, scrapeStats } = await scrapeIngredientsAndInsertBatched(ingredients, stores)
  console.log(`\n✅ Scraped ${scrapedCount} total products`)
  const inserted = insertedCount
  if (DAILY_SCRAPER_DRY_RUN) {
    console.log(`\n[DRY RUN] Would insert ${inserted} rows to database`)
  } else {
    console.log(`\n✅ Inserted ${inserted} rows to database`)
  }
  if (dedupedCount > 0) {
    console.log(`🔁 Deduped ${dedupedCount} in-flight queue item(s)`)
  }

  const duration = (Date.now() - startTime) / 1000
  const successRate = scrapedCount > 0 ? (inserted / scrapedCount) * 100 : 0

  console.log('\n' + '='.repeat(60))
  console.log('📊 SCRAPER SUMMARY')
  console.log('='.repeat(60))
  console.log(`Store Brand: ${STORE_BRAND || 'ALL'}`)
  console.log(`Stores: ${stores.length}`)
  console.log(`Ingredients: ${ingredients.length}`)
  console.log(`Scraped: ${scrapedCount}`)
  console.log(`${DAILY_SCRAPER_DRY_RUN ? 'Would Insert' : 'Inserted'}: ${inserted}`)
  console.log(`Deduped In Flight: ${dedupedCount}`)
  console.log(`Success Rate: ${successRate.toFixed(1)}%`)
  console.log(`Duration: ${duration.toFixed(1)}s`)
  console.log('='.repeat(60))

  if (SUMMARY_MODE === 'detailed' && Array.isArray(scrapeStats?.stores) && scrapeStats.stores.length > 0) {
    console.log('\n📋 DETAILED STORE SUMMARY')
    console.log('='.repeat(60))

    const slowestStores = [...scrapeStats.stores]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10)

    for (const storeStat of slowestStores) {
      const hitRate = storeStat.ingredientsAttempted > 0
        ? ((storeStat.ingredientsWithHits / storeStat.ingredientsAttempted) * 100).toFixed(1)
        : '0.0'
      const stopLabel = storeStat.stopReason || (storeStat.skippedForErrors ? 'skipped' : 'completed')

      console.log(
        `- ${storeStat.storeEnum} (${storeStat.zipCode || 'no-zip'}) ` +
        `time=${(storeStat.durationMs / 1000).toFixed(1)}s ` +
        `hits=${storeStat.ingredientsWithHits}/${storeStat.ingredientsAttempted} (${hitRate}%) ` +
        `prices=${storeStat.scrapedCount} ` +
        `errors=${storeStat.errorCount} chunks=${storeStat.chunkCount} stop=${stopLabel}`
      )

      if (storeStat.lastErrorMessage) {
        console.log(`  last_error: ${truncateText(storeStat.lastErrorMessage, 180)}`)
      }
    }

    const totals = scrapeStats.stores.reduce((acc, storeStat) => {
      acc.totalErrors += storeStat.errorCount
      acc.totalHitIngredients += storeStat.ingredientsWithHits
      acc.totalIngredients += storeStat.ingredientsAttempted
      acc.totalTarget404s += storeStat.target404Count
      return acc
    }, {
      totalErrors: 0,
      totalHitIngredients: 0,
      totalIngredients: 0,
      totalTarget404s: 0,
    })

    const overallHitRate = totals.totalIngredients > 0
      ? ((totals.totalHitIngredients / totals.totalIngredients) * 100).toFixed(1)
      : '0.0'

    console.log('\nSummary Totals:')
    console.log(`  Ingredient hit rate: ${totals.totalHitIngredients}/${totals.totalIngredients} (${overallHitRate}%)`)
    console.log(`  Store errors: ${totals.totalErrors}`)
    console.log(`  Target 404 events: ${totals.totalTarget404s}`)
  }

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

  if (!DAILY_SCRAPER_DRY_RUN && inserted < scrapedCount * 0.2) {
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
