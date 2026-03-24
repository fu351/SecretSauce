#!/usr/bin/env node

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
  normalizeZipCode,
} from './utils/daily-scraper-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const { getNearestStore } = require('../scrapers')

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
const STORE_LIMIT = getIntEnv('BACKFILL_STORE_LIMIT', 0, 0)
const STORE_CONCURRENCY = getIntEnv('BACKFILL_STORE_CONCURRENCY', 4, 1)
const DRY_RUN = getBooleanEnv('BACKFILL_DRY_RUN', true)

let supabase = null

function getSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  }
  return supabase
}

async function fetchStoresMissingTargetStoreId() {
  console.log('📍 Fetching Target stores missing target_store_id...')
  if (STORE_STATE || STORE_CITY || STORE_CITIES_CSV || STORE_ZIP_MIN || STORE_ZIP_MAX) {
    console.log(`🔎 Store filters: ${formatStoreFilterSummary(STORE_FILTER_CONTEXT)}`)
  }

  const allStores = []
  let offset = 0

  while (true) {
    let query = getSupabase()
      .from('grocery_stores')
      .select('id, zip_code, state, city, name, metadata')
      .eq('store_enum', 'target')
      .eq('is_active', true)
      .not('zip_code', 'is', null)
      .or('metadata->>target_store_id.is.null,metadata->>target_store_id.eq.')
      .order('zip_code', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    query = applyStoreRangeFilters(query, STORE_FILTER_CONTEXT)

    const { data, error } = await query
    if (error) throw error

    const pageStores = (data || [])
      .map(store => ({ ...store, zip_code: normalizeZipCode(store.zip_code) }))
      .filter(store => store.zip_code)

    allStores.push(...pageStores)

    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const stores = STORE_LIMIT > 0 ? allStores.slice(0, STORE_LIMIT) : allStores
  console.log(`✅ Found ${stores.length} Target stores missing target_store_id`)
  return stores
}

async function backfillStore(store, index, total) {
  const label = `${store.city || store.zip_code}, ${store.state} (${store.zip_code})`
  process.stdout.write(`  [${index + 1}/${total}] ${label} → `)

  let storeInfo
  try {
    storeInfo = await getNearestStore(store.zip_code)
  } catch (err) {
    console.log(`ERROR: ${err.message}`)
    return { storeId: store.id, zipCode: store.zip_code, outcome: 'error', error: err.message }
  }

  if (!storeInfo || !storeInfo.target_store_id) {
    console.log('no store found')
    return { storeId: store.id, zipCode: store.zip_code, outcome: 'no_store' }
  }

  const updatedMetadata = {
    ...(store.metadata || {}),
    target_store_id: String(storeInfo.target_store_id),
    target_store_name: storeInfo.name || null,
    target_store_address: storeInfo.fullAddress || null,
    backfilled_at: new Date().toISOString(),
    backfill_source: 'getNearestStore_api',
  }

  if (DRY_RUN) {
    console.log(`DRY RUN → store_id=${updatedMetadata.target_store_id} "${updatedMetadata.target_store_name}"`)
    return { storeId: store.id, zipCode: store.zip_code, outcome: 'dry_run', resolvedStoreId: updatedMetadata.target_store_id }
  }

  const { error } = await getSupabase()
    .from('grocery_stores')
    .update({ metadata: updatedMetadata })
    .eq('id', store.id)

  if (error) {
    console.log(`DB ERROR: ${error.message}`)
    return { storeId: store.id, zipCode: store.zip_code, outcome: 'db_error', error: error.message }
  }

  console.log(`✓ store_id=${updatedMetadata.target_store_id} "${updatedMetadata.target_store_name}"`)
  return { storeId: store.id, zipCode: store.zip_code, outcome: 'written', resolvedStoreId: updatedMetadata.target_store_id }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  console.log('🚀 Target Store ID Backfill Starting...')
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (set BACKFILL_DRY_RUN=false to write)' : 'WRITE'}`)
  console.log(`   Concurrency: ${STORE_CONCURRENCY}`)
  if (STORE_LIMIT > 0) console.log(`   Store limit: ${STORE_LIMIT}`)

  const stores = await fetchStoresMissingTargetStoreId()
  if (stores.length === 0) {
    console.log('\n✅ No stores need backfilling.')
    return
  }

  const startedAt = Date.now()
  const results = await mapWithConcurrency(
    stores,
    STORE_CONCURRENCY,
    (store, index) => backfillStore(store, index, stores.length)
  )

  const counts = {
    written: results.filter(r => r.outcome === 'written').length,
    dry_run: results.filter(r => r.outcome === 'dry_run').length,
    no_store: results.filter(r => r.outcome === 'no_store').length,
    error: results.filter(r => r.outcome === 'error').length,
    db_error: results.filter(r => r.outcome === 'db_error').length,
  }

  console.log('\n============================================================')
  console.log('📊 BACKFILL SUMMARY')
  console.log('============================================================')
  console.log(`Mode:         ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`)
  console.log(`Stores queued: ${stores.length}`)
  if (DRY_RUN) {
    console.log(`Would write:  ${counts.dry_run}`)
  } else {
    console.log(`Written:      ${counts.written}`)
  }
  console.log(`No store found: ${counts.no_store}`)
  console.log(`Errors:       ${counts.error + counts.db_error}`)
  console.log(`Duration:     ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)

  if (counts.no_store > 0) {
    const missing = results.filter(r => r.outcome === 'no_store').map(r => r.zipCode)
    console.log(`\nZIPs with no nearby store: ${missing.join(', ')}`)
  }

  if (counts.error + counts.db_error > 0) {
    const failed = results.filter(r => r.outcome === 'error' || r.outcome === 'db_error')
    console.log('\nFailed stores:')
    for (const r of failed) {
      console.log(`  ${r.zipCode}: ${r.error}`)
    }
  }

  if (DRY_RUN && counts.dry_run > 0) {
    console.log('\nRe-run with BACKFILL_DRY_RUN=false to commit changes.')
  }
}

main().catch(error => {
  console.error('\n💥 Backfill failed:', error)
  process.exit(1)
})
