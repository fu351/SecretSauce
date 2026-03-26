#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  applyStoreRangeFilters,
  buildStoreFilterContext,
  formatStoreFilterSummary,
  getBooleanEnv,
  getIntEnv,
  mapWithConcurrency,
  normalizeStoreEnum,
  normalizeZipCode,
  truncateText,
} from '../workers/daily-scraper-worker/utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const { searchTarget } = require('../scrapers')

dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const STORE_STATE = process.env.STORE_STATE || null
const STORE_CITY = process.env.STORE_CITY || null
const STORE_CITIES_CSV = process.env.STORE_CITIES_CSV || null
const STORE_ZIP_MIN = process.env.STORE_ZIP_MIN || null
const STORE_ZIP_MAX = process.env.STORE_ZIP_MAX || null
const STORE_FILTER_CONTEXT = buildStoreFilterContext({
  storeState: STORE_STATE,
  storeCity: STORE_CITY,
  storeCitiesCsv: STORE_CITIES_CSV,
  storeZipMin: STORE_ZIP_MIN,
  storeZipMax: STORE_ZIP_MAX,
})

const PAGE_SIZE = 1000
const STORE_LIMIT = getIntEnv('TARGET_DIAGNOSTIC_STORE_LIMIT', 0, 0)
const STORE_CONCURRENCY = getIntEnv('TARGET_DIAGNOSTIC_STORE_CONCURRENCY', 4, 1)
const INGREDIENT_CONCURRENCY = getIntEnv('TARGET_DIAGNOSTIC_INGREDIENT_CONCURRENCY', 4, 1)
const HISTORY_LIMIT = getIntEnv('TARGET_DIAGNOSTIC_HISTORY_LIMIT', 5, 0)
const BASELINE_INGREDIENT_LIMIT = getIntEnv('TARGET_DIAGNOSTIC_BASELINE_INGREDIENT_LIMIT', 5, 0)
const OUTPUT_PATH = String(
  process.env.TARGET_DIAGNOSTIC_OUTPUT_PATH || 'docker/diagnostics-output/target-store-diagnostics.json'
).trim()
const INCLUDE_HISTORY = getBooleanEnv('TARGET_DIAGNOSTIC_INCLUDE_HISTORY', true)
const INCLUDE_BASELINE = getBooleanEnv('TARGET_DIAGNOSTIC_INCLUDE_BASELINE', true)
const FALLBACK_BASELINE_INGREDIENTS = [
  'milk',
  'eggs',
  'bread',
  'banana',
  'apple',
]

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
    store_id: targetStoreId,
    grocery_store_id: toNonEmptyString(base.grocery_store_id ?? base.groceryStoreId ?? base.id),
    zip_code: zipCode || null,
    name: toNonEmptyString(base.name),
    address: toNonEmptyString(base.address),
    raw: rawMetadata,
  }
}

function parseCsvList(value) {
  if (!value) return []
  const seen = new Set()
  const items = []
  for (const part of String(value).split(',')) {
    const normalized = String(part || '').trim()
    if (!normalized || seen.has(normalized.toLowerCase())) continue
    seen.add(normalized.toLowerCase())
    items.push(normalized)
  }
  return items
}

function dedupeStrings(values) {
  const seen = new Set()
  const output = []
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
  }
  return output
}

function getHistorical404Ingredients(store) {
  const metadata = parseMetadataObject(store?.metadata)
  const scraperRuntime = parseMetadataObject(metadata.scraper_runtime)
  const events = Array.isArray(scraperRuntime.http_404_events) ? scraperRuntime.http_404_events : []
  const lastEvent = scraperRuntime.last_http_404 ? [scraperRuntime.last_http_404] : []

  const ingredients = [...lastEvent, ...events]
    .map(event => toNonEmptyString(event?.ingredient))
    .filter(Boolean)

  return dedupeStrings(ingredients).slice(0, HISTORY_LIMIT > 0 ? HISTORY_LIMIT : undefined)
}

async function fetchTargetStores() {
  console.log('📍 Fetching Target stores for diagnostics...')
  if (STORE_STATE || STORE_CITY || STORE_CITIES_CSV || STORE_ZIP_MIN || STORE_ZIP_MAX) {
    console.log(`🔎 Store filters: ${formatStoreFilterSummary(STORE_FILTER_CONTEXT)}`)
  }

  const allStores = []
  let offset = 0

  while (true) {
    let query = getSupabase()
      .from('grocery_stores')
      .select('id, store_enum, zip_code, address, name, city, state, metadata')
      .eq('store_enum', 'target')
      .eq('is_active', true)
      .not('zip_code', 'is', null)
      .order('zip_code', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    query = applyStoreRangeFilters(query, STORE_FILTER_CONTEXT)

    const { data, error } = await query
    if (error) throw error

    const pageStores = (data || [])
      .map(store => ({ ...store, zip_code: normalizeZipCode(store.zip_code) }))
      .filter(store => store.zip_code)

    allStores.push(...pageStores)

    if (!data || data.length < PAGE_SIZE) {
      break
    }
    offset += PAGE_SIZE
  }

  const stores = STORE_LIMIT > 0 ? allStores.slice(0, STORE_LIMIT) : allStores
  console.log(`✅ Found ${stores.length} Target stores with valid ZIP codes`)
  return stores
}

async function fetchBaselineIngredients() {
  const envIngredients = parseCsvList(process.env.TARGET_DIAGNOSTIC_INGREDIENTS_CSV)
  if (envIngredients.length > 0) {
    console.log(`🧪 Using ${envIngredients.length} explicit diagnostic ingredients from TARGET_DIAGNOSTIC_INGREDIENTS_CSV`)
    return envIngredients
  }

  if (!INCLUDE_BASELINE || BASELINE_INGREDIENT_LIMIT === 0) {
    return []
  }

  console.log('📚 Fetching baseline canonical ingredients...')

  const { data, error } = await getSupabase()
    .from('standardized_ingredients')
    .select('canonical_name')
    .not('canonical_name', 'is', null)
    .order('canonical_name', { ascending: true })
    .limit(Math.max(BASELINE_INGREDIENT_LIMIT, FALLBACK_BASELINE_INGREDIENTS.length))

  if (error) throw error

  const canonicalIngredients = dedupeStrings(
    (data || []).map(row => row.canonical_name)
  ).slice(0, BASELINE_INGREDIENT_LIMIT)

  if (canonicalIngredients.length > 0) {
    console.log(`✅ Loaded ${canonicalIngredients.length} baseline canonical ingredients`)
    return canonicalIngredients
  }

  console.log(`⚠️ Falling back to ${FALLBACK_BASELINE_INGREDIENTS.length} built-in baseline ingredients`)
  return FALLBACK_BASELINE_INGREDIENTS.slice(0, BASELINE_INGREDIENT_LIMIT)
}

function buildStoreIngredientList(store, baselineIngredients) {
  const historical = INCLUDE_HISTORY ? getHistorical404Ingredients(store) : []
  const ingredients = dedupeStrings([...historical, ...baselineIngredients])
  return {
    ingredients,
    historicalIngredients: historical,
  }
}

async function diagnoseIngredient(store, storeMetadata, ingredient) {
  try {
    const results = await searchTarget(ingredient, storeMetadata, store.zip_code)
    return {
      ingredient,
      outcome: results.length > 0 ? 'success' : 'no_results',
      resultCount: results.length,
    }
  } catch (error) {
    const code = String(error?.code || '').toUpperCase()
    const status = error?.status ?? error?.response?.status ?? null
    const debugContext = error?.debugContext || null
    const is404 = status === 404 || code === 'TARGET_HTTP_404'

    return {
      ingredient,
      outcome: is404 ? 'http_404' : 'error',
      resultCount: 0,
      errorCode: code || null,
      errorStatus: status,
      errorMessage: truncateText(error?.message || String(error)),
      debugContext,
    }
  }
}

async function diagnoseStore(store, baselineIngredients, index, total) {
  const storeMetadata = normalizeTargetStoreMetadata(store, store.zip_code)
  const { ingredients, historicalIngredients } = buildStoreIngredientList(store, baselineIngredients)

  console.log(`\n🏬 Store ${index + 1}/${total}: target (${store.zip_code})`)
  console.log(
    `   Metadata target_store_id: ${storeMetadata.target_store_id || 'missing'} | ` +
    `grocery_store_id: ${storeMetadata.grocery_store_id || 'missing'}`
  )
  console.log(`   Testing ${ingredients.length} ingredients (${historicalIngredients.length} historical 404, ${Math.max(0, ingredients.length - historicalIngredients.length)} baseline)`)

  if (ingredients.length === 0) {
    return {
      storeId: store.id,
      zipCode: store.zip_code,
      metadataTargetStoreId: storeMetadata.target_store_id,
      groceryStoreId: storeMetadata.grocery_store_id,
      historical404Ingredients: historicalIngredients,
      testedIngredients: [],
      counts: {
        success: 0,
        noResults: 0,
        http404: 0,
        otherErrors: 0,
      },
      resolved404StoreIds: [],
      requestUrls: [],
      outcomeDetails: [],
    }
  }

  const startedAt = Date.now()
  const results = await mapWithConcurrency(
    ingredients,
    INGREDIENT_CONCURRENCY,
    ingredient => diagnoseIngredient(store, storeMetadata, ingredient)
  )

  const counts = {
    success: results.filter(entry => entry.outcome === 'success').length,
    noResults: results.filter(entry => entry.outcome === 'no_results').length,
    http404: results.filter(entry => entry.outcome === 'http_404').length,
    otherErrors: results.filter(entry => entry.outcome === 'error').length,
  }

  const resolved404StoreIds = dedupeStrings(
    results
      .filter(entry => entry.outcome === 'http_404')
      .map(entry => entry.debugContext?.storeId)
  )
  const requestUrls = dedupeStrings(
    results
      .filter(entry => entry.outcome === 'http_404')
      .map(entry => entry.debugContext?.requestUrl)
  )

  console.log(
    `   Summary: success=${counts.success}, no_results=${counts.noResults}, ` +
    `http_404=${counts.http404}, other_errors=${counts.otherErrors}, ` +
    `duration=${((Date.now() - startedAt) / 1000).toFixed(1)}s`
  )

  return {
    storeId: store.id,
    zipCode: store.zip_code,
    city: store.city || null,
    state: store.state || null,
    metadataTargetStoreId: storeMetadata.target_store_id,
    groceryStoreId: storeMetadata.grocery_store_id,
    historical404Ingredients: historicalIngredients,
    testedIngredients: ingredients,
    counts,
    resolved404StoreIds,
    requestUrls,
    outcomeDetails: results,
  }
}

function buildSummary(storeResults) {
  const summary = {
    totalStores: storeResults.length,
    storesMissingMetadataTargetStoreId: 0,
    storesWith404s: 0,
    storesWithOtherErrors: 0,
    total404s: 0,
    totalOtherErrors: 0,
    totalNoResults: 0,
    totalSuccesses: 0,
    top404Ingredients: [],
  }

  const ingredientCounts = new Map()

  for (const store of storeResults) {
    if (!store.metadataTargetStoreId) {
      summary.storesMissingMetadataTargetStoreId += 1
    }
    if (store.counts.http404 > 0) {
      summary.storesWith404s += 1
    }
    if (store.counts.otherErrors > 0) {
      summary.storesWithOtherErrors += 1
    }
    summary.total404s += store.counts.http404
    summary.totalOtherErrors += store.counts.otherErrors
    summary.totalNoResults += store.counts.noResults
    summary.totalSuccesses += store.counts.success

    for (const detail of store.outcomeDetails) {
      if (detail.outcome !== 'http_404') continue
      ingredientCounts.set(detail.ingredient, (ingredientCounts.get(detail.ingredient) || 0) + 1)
    }
  }

  summary.top404Ingredients = [...ingredientCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([ingredient, count]) => ({ ingredient, count }))

  return summary
}

async function writeOutput(payload) {
  if (!OUTPUT_PATH) return

  const absolutePath = path.isAbsolute(OUTPUT_PATH)
    ? OUTPUT_PATH
    : path.join(path.dirname(__dirname), OUTPUT_PATH)

  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, JSON.stringify(payload, null, 2))
  console.log(`\n📝 Wrote Target diagnostics to ${absolutePath}`)
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for Target diagnostics')
  }

  console.log('🚀 Target Store Diagnostics Starting...')
  console.log(`   Store Concurrency: ${STORE_CONCURRENCY}`)
  console.log(`   Ingredient Concurrency: ${INGREDIENT_CONCURRENCY}`)
  console.log(`   History Limit: ${HISTORY_LIMIT}`)
  console.log(`   Baseline Ingredient Limit: ${BASELINE_INGREDIENT_LIMIT}`)

  const [stores, baselineIngredients] = await Promise.all([
    fetchTargetStores(),
    fetchBaselineIngredients(),
  ])

  const startedAt = Date.now()
  const storeResults = await mapWithConcurrency(
    stores,
    STORE_CONCURRENCY,
    (store, index) => diagnoseStore(store, baselineIngredients, index, stores.length)
  )

  const summary = buildSummary(storeResults)
  const payload = {
    generatedAt: new Date().toISOString(),
    config: {
      storeLimit: STORE_LIMIT,
      storeConcurrency: STORE_CONCURRENCY,
      ingredientConcurrency: INGREDIENT_CONCURRENCY,
      historyLimit: HISTORY_LIMIT,
      baselineIngredientLimit: BASELINE_INGREDIENT_LIMIT,
      includeHistory: INCLUDE_HISTORY,
      includeBaseline: INCLUDE_BASELINE,
      filters: formatStoreFilterSummary(STORE_FILTER_CONTEXT),
    },
    summary,
    stores: storeResults,
  }

  console.log('\n============================================================')
  console.log('📊 TARGET DIAGNOSTIC SUMMARY')
  console.log('============================================================')
  console.log(`Stores Tested: ${summary.totalStores}`)
  console.log(`Stores Missing metadata.target_store_id: ${summary.storesMissingMetadataTargetStoreId}`)
  console.log(`Stores With 404s: ${summary.storesWith404s}`)
  console.log(`Stores With Other Errors: ${summary.storesWithOtherErrors}`)
  console.log(`Total Successes: ${summary.totalSuccesses}`)
  console.log(`Total No Results: ${summary.totalNoResults}`)
  console.log(`Total 404s: ${summary.total404s}`)
  console.log(`Total Other Errors: ${summary.totalOtherErrors}`)
  console.log(`Duration: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
  if (summary.top404Ingredients.length > 0) {
    console.log('\nTop 404 Ingredients:')
    for (const entry of summary.top404Ingredients) {
      console.log(`- ${entry.ingredient}: ${entry.count}`)
    }
  }

  await writeOutput(payload)
}

main().catch(error => {
  console.error('\n💥 Target diagnostics failed:', error)
  process.exit(1)
})
