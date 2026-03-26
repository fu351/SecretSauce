import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import {
  applyStoreRangeFilters,
  emptyBatchResults,
  formatStoreFilterSummary,
  getProductName,
  hasStoreRangeFilters,
  mapWithConcurrency,
  normalizeBatchResultsShape,
  normalizeResultsShape,
  normalizeStoreEnum,
  normalizeZipCode,
  parseCooldownMsFromMessage,
  runBatchWithCooldownRetry,
  sleep,
  toPriceNumber,
  truncateText,
} from './utils.js'
import { STOP_REASON, ERROR_CODE } from './config.js'

const require = createRequire(import.meta.url)
const scrapers = require('../../scrapers')

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
  kroger: (keywords, zip, opts) => scrapers.searchKrogerBatch(keywords, zip, opts),
  meijer: scrapers.searchMeijerBatch,
  ranch99: scrapers.search99RanchBatch,
  '99ranch': scrapers.search99RanchBatch,
}

// ─── Supabase client ──────────────────────────────────────────────────────────

let supabase = null

function getSupabase(config) {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey)
  }
  return supabase
}

// ─── Normalization helpers ────────────────────────────────────────────────────

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

// ─── DB metadata helpers ──────────────────────────────────────────────────────

async function appendStoreFailureMetadata(store, details, config) {
  if (config.dryRun) {
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
    threshold: config.maxConsecutiveStoreErrors,
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
      store_city: config.storeCity || null,
      store_state: config.storeState || null,
      store_limit: config.storeLimit,
      ingredient_limit: config.ingredientLimit,
    },
  }

  const { error: logInsertError } = await getSupabase(config)
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

async function appendStoreHttp404Metadata(store, details, config) {
  if (config.dryRun) {
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
    error_code: toNonEmptyString(details.errorCode) || ERROR_CODE.HTTP_404,
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
      stop_reason: STOP_REASON.HTTP_404,
      stop_at: nowIso,
    },
  }

  const { error } = await getSupabase(config)
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

export async function appendBrandFailureMetadata(storeEnum, details, config) {
  if (!storeEnum) return

  console.warn(`⚠️ Recording fatal scraper failure logs for brand "${storeEnum}"...`)

  let query = getSupabase(config)
    .from('grocery_stores')
    .select('id, store_enum, zip_code')
    .eq('store_enum', storeEnum)
    .eq('is_active', true)
  query = applyStoreRangeFilters(query, config.storeFilterContext)

  const { data, error } = await query
  if (error) {
    console.error(`❌ Failed to fetch stores for fatal failure-log update (${storeEnum}): ${error.message}`)
    return
  }

  const storesToMark = (data || []).slice(0, config.storeLimit > 0 ? config.storeLimit : undefined)
  for (const store of storesToMark) {
    await appendStoreFailureMetadata(store, details, config)
  }
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchStores(config) {
  console.log('📍 Fetching grocery stores for scraper...')
  if (hasStoreRangeFilters(config.storeFilterContext)) {
    console.log(`🔎 Store filters: ${formatStoreFilterSummary(config.storeFilterContext)}`)
  }

  const allStores = []
  let offset = 0
  const normalizedBrand = config.storeBrand ? normalizeStoreEnum(config.storeBrand) : null

  while (true) {
    let query = getSupabase(config)
      .from('grocery_stores')
      .select('id, store_enum, zip_code, address, name, metadata')
      .not('zip_code', 'is', null)
      .eq('is_active', true)
      .order('store_enum', { ascending: true })
      .order('zip_code', { ascending: true })
      .range(offset, offset + config.pageSize - 1)

    if (normalizedBrand) {
      query = query.eq('store_enum', normalizedBrand)
    }

    query = applyStoreRangeFilters(query, config.storeFilterContext)

    const { data, error } = await query
    if (error) {
      console.error('❌ Error fetching stores:', error.message)
      throw error
    }

    const pageStores = (data || []).filter(row => row.zip_code)
    allStores.push(...pageStores)

    if (!data || data.length < config.pageSize) {
      break
    }

    offset += config.pageSize
  }

  const normalizedStores = allStores
    .map(store => ({ ...store, zip_code: normalizeZipCode(store.zip_code) }))
    .filter(store => store.zip_code)

  const stores = config.storeLimit > 0 ? normalizedStores.slice(0, config.storeLimit) : normalizedStores
  console.log(`✅ Found ${stores.length} stores with valid ZIP codes`)
  return stores
}

async function fetchAllCanonicalIngredients(config) {
  console.log('📚 Fetching canonical ingredients...')

  const allIngredients = []
  let offset = 0

  while (true) {
    const { data, error } = await getSupabase(config)
      .from('standardized_ingredients')
      .select('canonical_name')
      .not('canonical_name', 'is', null)
      .order('canonical_name', { ascending: true })
      .range(offset, offset + config.pageSize - 1)

    if (error) {
      console.error('❌ Error fetching ingredients:', error.message)
      throw error
    }

    const names = (data || [])
      .map(row => row.canonical_name)
      .filter(name => typeof name === 'string' && name.trim().length > 0)
      .map(name => name.trim())

    allIngredients.push(...names)

    if (!data || data.length < config.pageSize) {
      break
    }

    offset += config.pageSize
  }

  const uniqueIngredients = [...new Set(allIngredients)]
  const ingredients = config.ingredientLimit > 0 ? uniqueIngredients.slice(0, config.ingredientLimit) : uniqueIngredients
  console.log(`✅ Found ${ingredients.length} canonical ingredients`)
  return ingredients
}

// ─── Scraping ─────────────────────────────────────────────────────────────────

async function runBatchedScraperForStore(storeEnum, ingredientChunk, zipCode, batchConcurrency, scrapeStats, storeMetadata) {
  const nativeBatchScraper = STORE_BATCH_SCRAPER_MAP[storeEnum]
  const normalizedTargetMetadata = storeEnum === 'target' ? storeMetadata : null

  if (typeof nativeBatchScraper === 'function') {
    try {
      const nativeResults = await nativeBatchScraper(ingredientChunk, zipCode, { concurrency: batchConcurrency })
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
        const cooldownRemainingMs = parseCooldownMsFromMessage(message)
        if (cooldownRemainingMs > 0) {
          console.warn(
            `⚠️ Native batch scraper rate-limited for ${storeEnum}: ${message}. ` +
            `Sleeping ${Math.min(cooldownRemainingMs + 2000, 120000)}ms for cooldown to expire, then retrying chunk...`
          )
        } else {
          console.warn(
            `⚠️ Native batch scraper rate-limited for ${storeEnum}: ${message}. ` +
            'Marking chunk as errors to avoid retry storms.'
          )
        }
        const result = await runBatchWithCooldownRetry({
          runBatch: () => nativeBatchScraper(ingredientChunk, zipCode, { concurrency: batchConcurrency }),
          storeEnum,
          message,
          code,
          ingredientCount: ingredientChunk.length,
          sleepFn: sleep,
        })
        if (!result._retrySucceeded && cooldownRemainingMs > 0) {
          console.warn(`⚠️ Retry after cooldown also failed for ${storeEnum}. Marking chunk as errors.`)
        }
        const { _retrySucceeded: _, ...chunkResult } = result
        return chunkResult
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
      errorCodes: Array.from({ length: ingredientChunk.length }, () => ERROR_CODE.SCRAPER_NOT_CONFIGURED),
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

        return { results, hadError: false, errorMessage: '', isHttp404: false, errorCode: '' }
      } catch (error) {
        const message = error?.message || String(error)
        const status = error?.status ?? error?.response?.status
        const code = String(error?.code || '').toUpperCase()
        const isTarget404 = storeEnum === 'target' && (status === 404 || code === `TARGET_${ERROR_CODE.HTTP_404}`)
        const isHttp404 = status === 404 || code.includes('404')
        const isFatalAuthBlocked = code === ERROR_CODE.KROGER_AUTH_BLOCKED || code === ERROR_CODE.KROGER_AUTH_MISSING_CREDS

        if (isTarget404) {
          console.warn(
            `⚠️ Target 404 for ${storeEnum} (${zipCode}) ingredient "${ingredientName}" - stopping this store scrape`
          )
          if (scrapeStats?.target404s) {
            scrapeStats.target404s.push({ storeEnum, zipCode, ingredientName, timestamp: new Date().toISOString() })
          }
        }

        if (isHttp404) {
          return { results: [], hadError: true, errorMessage: message, isHttp404: true, errorCode: code || ERROR_CODE.HTTP_404 }
        }

        console.error(`❌ Scraper failed for ${storeEnum} (${zipCode}) ingredient "${ingredientName}": ${message}`)
        if (isFatalAuthBlocked) {
          return { results: [], hadError: true, errorMessage: message, isHttp404: false, errorCode: code }
        }

        return { results: [], hadError: true, errorMessage: message, isHttp404: false, errorCode: code || '' }
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

// ─── Insert queue ─────────────────────────────────────────────────────────────

class GlobalInsertQueue {
  constructor({ batchSize, maxQueueSize, insertConcurrency, config }) {
    this._queue = []
    this._batchSize = batchSize
    this._maxQueueSize = maxQueueSize
    this._insertConcurrency = insertConcurrency
    this._config = config
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
      uniqueItems.push({ ...item, _dedupeKey: dedupeKey })
    }

    if (uniqueItems.length === 0) return

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

  get totalInserted() { return this._totalInserted }
  get totalDeduped() { return this._totalDeduped }

  _maybeFlush() {
    while (this._queue.length >= this._batchSize && this._activeInserts < this._insertConcurrency) {
      const batch = this._queue.splice(0, this._batchSize)
      this._runInsert(batch)
    }
    this._notifyBackpressureWaiters()
  }

  _runInsert(batch) {
    this._activeInserts += 1
    bulkInsertIngredientHistory(batch, this._config)
      .then(inserted => { this._totalInserted += inserted })
      .catch(err => {
        if (!this._drainError) this._drainError = err
        this._notifyBackpressureWaiters()
        this._notifyConcurrencyWaiters()
      })
      .finally(() => {
        for (const item of batch) {
          if (item?._dedupeKey) this._inFlightKeys.delete(item._dedupeKey)
        }
        this._activeInserts -= 1
        this._notifyConcurrencyWaiters()
        this._maybeFlush()
      })
  }

  _notifyBackpressureWaiters() {
    if (!this._backpressureWaiters.length) return
    if (this._drainError || !this._maxQueueSize || this._queue.length < this._maxQueueSize) {
      // Wake one waiter at a time: the woken producer re-checks the condition,
      // pushes if there's room, then _maybeFlush triggers the next notification.
      // Waking all at once would cause N-1 producers to immediately re-sleep,
      // creating unnecessary promise churn.
      this._backpressureWaiters.shift()()
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

// ─── RPC helpers ──────────────────────────────────────────────────────────────

function getRpcErrorText(error) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.cause?.message,
  ]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase()
}

function isTransientRpcError(error) {
  const text = getRpcErrorText(error)
  if (!text) return false

  return (
    text.includes('fetch failed') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('eai_again') ||
    text.includes('enotfound') ||
    text.includes('socket hang up') ||
    text.includes('connection terminated') ||
    text.includes('network') ||
    text.includes('timeout') ||
    text.includes('429') ||
    text.includes('502') ||
    text.includes('503') ||
    text.includes('504')
  )
}

// Recursively insert a pre-normalized payload slice, splitting on timeout.
// splitDepth tracks how many times we've halved to aid log readability.
async function insertPayload(slice, splitDepth, config) {
  const label = splitDepth > 0 ? ` [split depth ${splitDepth}]` : ''

  for (let attempt = 0; attempt <= config.insertRpcMaxRetries; attempt += 1) {
    if (attempt === 0) {
      console.log(`💾${label} Inserting ${slice.length} items via RPC...`)
    } else {
      console.log(`💾${label} Retrying insert of ${slice.length} items via RPC (attempt ${attempt + 1}/${config.insertRpcMaxRetries + 1})...`)
    }

    const { data, error } = await getSupabase(config).rpc('fn_bulk_insert_ingredient_history', { p_items: slice })

    if (!error) {
      const insertedCount = Array.isArray(data)
        ? data.length
        : (typeof data === 'number' ? data : (data?.inserted_count ?? 0))
      console.log(`✅${label} Inserted ${insertedCount} rows`)
      return insertedCount
    }

    const isLastAttempt = attempt >= config.insertRpcMaxRetries
    const isTransient = isTransientRpcError(error)
    console.error(`❌${label} RPC error:`, error.message)

    if (isLastAttempt && isTransient && slice.length > 1) {
      const mid = Math.floor(slice.length / 2)
      console.warn(
        `⚠️${label} Transient failure on ${slice.length} items after ${config.insertRpcMaxRetries + 1} attempt(s). ` +
        `Splitting into [${mid}, ${slice.length - mid}]...`
      )
      const [leftCount, rightCount] = await Promise.all([
        insertPayload(slice.slice(0, mid), splitDepth + 1, config),
        insertPayload(slice.slice(mid), splitDepth + 1, config),
      ])
      return leftCount + rightCount
    }

    if (isLastAttempt || !isTransient) {
      throw error
    }

    const baseDelay = config.insertRpcRetryBaseDelayMs * (2 ** attempt)
    const jitterMs = Math.floor(Math.random() * 250)
    const delayMs = Math.min(baseDelay + jitterMs, config.insertRpcRetryMaxDelayMs)
    console.warn(
      `⚠️${label} Transient RPC failure (attempt ${attempt + 1}/${config.insertRpcMaxRetries + 1}). ` +
      `Retrying in ${delayMs}ms...`
    )
    await sleep(delayMs)
  }

  return 0
}

async function bulkInsertIngredientHistory(items, config) {
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
      unit: item.unit ?? null,
    }))
    .filter(item => item.price !== null && item.price >= 0 && item.productName && item.zipCode)

  if (!payload.length) {
    console.warn('⚠️  No valid payload rows after normalization')
    return 0
  }

  if (config.dryRun) {
    console.log(`[DRY RUN] Would insert ${payload.length} items via fn_bulk_insert_ingredient_history`)
    return payload.length
  }

  return insertPayload(payload, 0, config)
}

// ─── Per-store scrape logic ───────────────────────────────────────────────────

async function processStore(store, storeIndex, { ingredients, storeCount, insertQueue, config }) {
  let localScrapedCount = 0
  let localChunkCount = 0
  let localIngredientsAttempted = 0
  let localIngredientsWithHits = 0
  const storeStartTime = Date.now()

  const storeEnum = normalizeStoreEnum(store.store_enum)
  const zipCode = normalizeZipCode(store.zip_code)
  const { scraperBatchSize: batchSize, scraperBatchConcurrency: batchConcurrency } = config
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

  console.log(`\n🏬 Store ${storeIndex + 1}/${storeCount}: ${storeEnum} (${zipCode || 'no-zip'})`)
  console.log(`   ⚙️ Batch size: ${batchSize}, concurrency: ${batchConcurrency}`)
  const normalizedTargetMetadata =
    storeEnum === 'target' ? normalizeTargetStoreMetadata(store, zipCode) : null

  for (let i = 0; i < ingredients.length; i += batchSize) {
    const chunk = ingredients.slice(i, i + batchSize)
    const chunkLabel = `${i + 1}-${Math.min(i + chunk.length, ingredients.length)}`
    console.log(`   📦 Batched ingredients ${chunkLabel}/${ingredients.length}`)

    const { resultsByIngredient, errorFlags, errorMessages, http404Flags, errorCodes } =
      await runBatchedScraperForStore(
        storeEnum, chunk, zipCode, batchConcurrency,
        { target404s: storeTarget404s },
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
        stopReason = STOP_REASON.HTTP_404
        lastErrorMessage = errorMessages[idx] || `HTTP 404 for ${storeEnum} (${zipCode}) ingredient "${ingredientName}"`
        skippedForErrors = true
        await appendStoreHttp404Metadata(store, { ingredientName, errorCode: errorCodes[idx], message: lastErrorMessage }, config)
        break
      }

      if (errorFlags[idx]) {
        consecutiveStoreErrors += 1
        totalStoreErrors += 1
        if (errorMessages[idx]) lastErrorMessage = errorMessages[idx]

        if (errorCodes[idx] === ERROR_CODE.KROGER_AUTH_BLOCKED || errorCodes[idx] === ERROR_CODE.KROGER_AUTH_MISSING_CREDS) {
          skippedForErrors = true
          stopReason = STOP_REASON.AUTH_BLOCKED
          break
        }

        if (config.maxConsecutiveStoreErrors > 0 && consecutiveStoreErrors > config.maxConsecutiveStoreErrors) {
          skippedForErrors = true
          stopReason = STOP_REASON.CONSECUTIVE_ERRORS
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
      if (stopReason === STOP_REASON.HTTP_404) {
        console.warn(
          `   ⏭️ Stopping scrape for ${storeEnum} (${zipCode}) immediately after HTTP 404 ` +
          `and skipping remaining ingredients for this store.`
        )
      } else {
        console.warn(
          `   ⏭️ Skipping remaining ingredients for ${storeEnum} (${zipCode}) after ` +
          `${consecutiveStoreErrors} consecutive scraper errors (threshold: ${config.maxConsecutiveStoreErrors}).`
        )
      }
      break
    }

    if (i + batchSize < ingredients.length && config.ingredientDelayMs > 0) {
      await sleep(config.ingredientDelayMs)
    }
  }

  if (totalStoreErrors > 0) {
    await appendStoreFailureMetadata(store, {
      errorCount: totalStoreErrors,
      consecutiveErrors: consecutiveStoreErrors,
      skippedForErrors,
      lastErrorMessage,
      errorType: stopReason === STOP_REASON.HTTP_404
        ? STOP_REASON.HTTP_404
        : (stopReason === STOP_REASON.AUTH_BLOCKED ? STOP_REASON.AUTH_BLOCKED : undefined),
      status: stopReason === STOP_REASON.HTTP_404
        ? 'skipped_after_http_404'
        : (stopReason === STOP_REASON.AUTH_BLOCKED ? 'skipped_after_auth_blocked' : undefined),
    }, config)
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

// ─── Main processor ───────────────────────────────────────────────────────────

async function scrapeIngredientsAndInsertBatched(ingredients, stores, config) {
  let skippedStoreCount = 0
  const scrapeStats = { target404s: [], stores: [] }

  const insertQueue = new GlobalInsertQueue({
    batchSize: config.insertBatchSize,
    maxQueueSize: config.insertQueueMaxSize,
    insertConcurrency: config.insertConcurrency,
    config,
  })

  const storeResults = await mapWithConcurrency(
    stores,
    config.storeConcurrency,
    (store, storeIndex) => processStore(store, storeIndex, { ingredients, storeCount: stores.length, insertQueue, config })
  )

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

export async function runDailyScraper(config) {
  const stores = await fetchStores(config)
  if (!stores.length) {
    return { stores, ingredients: [], scrapedCount: 0, insertedCount: 0, scrapeStats: { stores: [], target404s: [] } }
  }

  const ingredients = await fetchAllCanonicalIngredients(config)
  if (!ingredients.length) {
    return { stores, ingredients, scrapedCount: 0, insertedCount: 0, scrapeStats: { stores: [], target404s: [] } }
  }

  const { scrapedCount, insertedCount, dedupedCount, scrapeStats } =
    await scrapeIngredientsAndInsertBatched(ingredients, stores, config)

  return { stores, ingredients, scrapedCount, insertedCount, dedupedCount, scrapeStats }
}
