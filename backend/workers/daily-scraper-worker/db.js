import { createClient } from '@supabase/supabase-js'
import {
  applyStoreRangeFilters,
  formatStoreFilterSummary,
  hasStoreRangeFilters,
  normalizeStoreEnum,
  normalizeZipCode,
  truncateText,
} from './utils.js'
import { ERROR_CODE, STOP_REASON } from './config.js'

// ─── Supabase client ──────────────────────────────────────────────────────────

let supabase = null

export function getSupabase(config) {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey)
  }
  return supabase
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function toNonEmptyString(value) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

export function parseMetadataObject(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }
  return metadata
}

// ─── DB metadata helpers ──────────────────────────────────────────────────────

export async function appendStoreFailureMetadata(store, details, config) {
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

export async function appendStoreHttp404Metadata(store, details, config) {
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

export async function fetchStores(config) {
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

    if (!data || data.length < config.pageSize) break
    offset += config.pageSize
  }

  const normalizedStores = allStores
    .map(store => ({ ...store, zip_code: normalizeZipCode(store.zip_code) }))
    .filter(store => store.zip_code)

  const stores = config.storeLimit > 0 ? normalizedStores.slice(0, config.storeLimit) : normalizedStores
  console.log(`✅ Found ${stores.length} stores with valid ZIP codes`)
  return stores
}

export async function fetchAllCanonicalIngredients(config) {
  console.log('📚 Fetching canonical ingredients used in recipes...')

  // Step 1: collect all distinct standardized_ingredient_ids from recipe_ingredients
  const ingredientIdSet = new Set()
  let offset = 0

  while (true) {
    const { data, error } = await getSupabase(config)
      .from('recipe_ingredients')
      .select('standardized_ingredient_id')
      .not('standardized_ingredient_id', 'is', null)
      .is('deleted_at', null)
      .range(offset, offset + config.pageSize - 1)

    if (error) {
      console.error('❌ Error fetching recipe ingredient ids:', error.message)
      throw error
    }

    for (const row of data || []) {
      if (row.standardized_ingredient_id) ingredientIdSet.add(row.standardized_ingredient_id)
    }

    if (!data || data.length < config.pageSize) break
    offset += config.pageSize
  }

  console.log(`   Found ${ingredientIdSet.size} unique standardized ingredient ids in recipe_ingredients`)

  // Step 2: fetch canonical names for those IDs in batches
  const ids = [...ingredientIdSet]
  const ID_BATCH_SIZE = 500
  const allIngredients = []

  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batch = ids.slice(i, i + ID_BATCH_SIZE)
    const { data, error } = await getSupabase(config)
      .from('standardized_ingredients')
      .select('canonical_name')
      .in('id', batch)
      .not('canonical_name', 'is', null)

    if (error) {
      console.error('❌ Error fetching canonical names:', error.message)
      throw error
    }

    const names = (data || [])
      .map(row => row.canonical_name)
      .filter(name => typeof name === 'string' && name.trim().length > 0)
      .map(name => name.trim())

    allIngredients.push(...names)
  }

  const uniqueIngredients = [...new Set(allIngredients)].sort()
  const ingredients = config.ingredientLimit > 0 ? uniqueIngredients.slice(0, config.ingredientLimit) : uniqueIngredients
  console.log(`✅ Found ${ingredients.length} canonical ingredients used in recipes`)
  return ingredients
}
