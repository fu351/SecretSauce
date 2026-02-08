#!/usr/bin/env node

/**
 * Daily Ingredient Scraper (Direct RPC mode)
 *
 * - Fetches canonical ingredients from standardized_ingredients
 * - Fetches CA grocery store locations from grocery_stores
 * - Runs scrapers directly (no /api/batch-scraper hop)
 * - Inserts results through fn_bulk_insert_ingredient_history RPC
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const scrapers = require('../lib/scrapers')

dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STORE_BRAND = process.env.STORE_BRAND || null

function getIntEnv(name, fallback, minValue = 0) {
  const parsed = Number.parseInt(process.env[name] || '', 10)
  if (Number.isFinite(parsed) && parsed >= minValue) {
    return parsed
  }
  return fallback
}

const INGREDIENT_LIMIT = getIntEnv('INGREDIENT_LIMIT', 0, 0)
const STORE_LIMIT = getIntEnv('STORE_LIMIT', 0, 0)
const STORE_CONCURRENCY = getIntEnv('STORE_CONCURRENCY', 20, 1)
const INGREDIENT_DELAY_MS = getIntEnv('INGREDIENT_DELAY_MS', 1000, 0)
const INSERT_BATCH_SIZE = getIntEnv('INSERT_BATCH_SIZE', 500, 1)

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

let supabase = null

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeStoreEnum(storeValue) {
  return String(storeValue || '').trim().toLowerCase()
}

function toPriceNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const stripped = value.replace(/[^0-9.-]/g, '')
    const parsed = Number.parseFloat(stripped)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeResultsShape(rawResults) {
  if (Array.isArray(rawResults)) {
    return rawResults
  }

  if (Array.isArray(rawResults?.items)) {
    return rawResults.items
  }

  return []
}

function pickBestResult(results) {
  const withPrice = results
    .map(item => ({
      ...item,
      _price: toPriceNumber(item?.price)
    }))
    .filter(item => item._price !== null && item._price >= 0)

  if (withPrice.length === 0) {
    return null
  }

  withPrice.sort((a, b) => a._price - b._price)
  return withPrice[0]
}

function getProductName(result, fallbackIngredient) {
  return (
    result?.product_name ||
    result?.title ||
    result?.name ||
    result?.description ||
    fallbackIngredient ||
    null
  )
}

function getSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  }

  return supabase
}

async function fetchCaliforniaStores(storeBrand = null) {
  console.log('📍 Fetching California grocery stores...')

  const allStores = []
  let offset = 0

  while (true) {
    let query = getSupabase()
      .from('grocery_stores')
      .select('id, store_enum, zip_code, address, name')
      .not('zip_code', 'is', null)
      .gte('zip_code', '90000')
      .lte('zip_code', '96199')
      .eq('city', 'Berkeley')
      .eq('is_active', true)
      .order('store_enum', { ascending: true })
      .order('zip_code', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (storeBrand) {
      query = query.eq('store_enum', normalizeStoreEnum(storeBrand))
    }

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

  const stores = STORE_LIMIT > 0 ? allStores.slice(0, STORE_LIMIT) : allStores
  console.log(`✅ Found ${stores.length} California stores`)
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

async function mapWithConcurrency(items, concurrency, mapper) {
  if (!items.length) return []

  const limit = Math.max(1, Math.min(concurrency, items.length))
  const output = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor
      cursor += 1

      if (index >= items.length) {
        return
      }

      output[index] = await mapper(items[index], index)
    }
  }

  const workers = Array.from({ length: limit }, () => worker())
  await Promise.all(workers)
  return output
}

async function scrapeIngredientAtStore(ingredientName, store) {
  const storeEnum = normalizeStoreEnum(store.store_enum)
  const scraper = SCRAPER_MAP[storeEnum]

  if (!scraper) {
    console.warn(`⚠️  No scraper configured for "${storeEnum}"`)
    return null
  }

  try {
    const rawResults = await scraper(ingredientName, store.zip_code)
    const results = normalizeResultsShape(rawResults)

    if (!results.length) {
      return null
    }

    const best = pickBestResult(results)
    if (!best) {
      return null
    }

    return {
      store: storeEnum,
      price: best._price,
      imageUrl: best.image_url || best.imageUrl || null,
      productName: getProductName(best, ingredientName),
      productId: best.product_id || best.id || null,
      zipCode: String(store.zip_code || ''),
      store_id: store.id || null
    }
  } catch (error) {
    console.error(`❌ Scraper failed for ${storeEnum} (${store.zip_code}): ${error.message}`)
    return null
  }
}

async function scrapeIngredientsAcrossStores(ingredients, stores) {
  const allResults = []

  for (let i = 0; i < ingredients.length; i += 1) {
    const ingredient = ingredients[i]
    console.log(`\n📦 Processing ${i + 1}/${ingredients.length}: ${ingredient}`)

    const storeResults = await mapWithConcurrency(
      stores,
      STORE_CONCURRENCY,
      store => scrapeIngredientAtStore(ingredient, store)
    )

    const validResults = storeResults.filter(Boolean)
    allResults.push(...validResults)

    console.log(`   ✅ Found ${validResults.length}/${stores.length} prices`)

    if (i < ingredients.length - 1 && INGREDIENT_DELAY_MS > 0) {
      await sleep(INGREDIENT_DELAY_MS)
    }
  }

  return allResults
}

async function bulkInsertIngredientHistory(items) {
  if (!items || items.length === 0) {
    console.log('⚠️  No items to insert')
    return 0
  }

  const payload = items.map(item => ({
    store: normalizeStoreEnum(item.store),
    price: item.price ?? 0,
    imageUrl: item.imageUrl ?? null,
    productName: item.productName ?? null,
    productId: item.productId ?? null,
    zipCode: item.zipCode ?? '',
    store_id: item.store_id ?? null
  }))

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

async function insertInBatches(items, batchSize = INSERT_BATCH_SIZE) {
  let totalInserted = 0

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    console.log(`📦 Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} items`)

    const inserted = await bulkInsertIngredientHistory(batch)
    totalInserted += inserted

    if (i + batchSize < items.length) {
      await sleep(1000)
    }
  }

  return totalInserted
}

async function main() {
  const startTime = Date.now()

  console.log('🚀 Daily Ingredient Scraper Starting...')
  console.log(`   Store Brand: ${STORE_BRAND || 'ALL'}`)
  console.log(`   Strategy: Direct RPC + CA stores`)
  console.log(`   Store Concurrency: ${STORE_CONCURRENCY}`)
  console.log(`   Insert Batch Size: ${INSERT_BATCH_SIZE}`)

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const stores = await fetchCaliforniaStores(STORE_BRAND)
  if (!stores.length) {
    if (STORE_BRAND) {
      console.warn(`⚠️  No California stores found for "${STORE_BRAND}", skipping job`)
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

  const results = await scrapeIngredientsAcrossStores(ingredients, stores)
  console.log(`\n✅ Scraped ${results.length} total products`)

  const inserted = await insertInBatches(results)
  console.log(`\n✅ Inserted ${inserted} rows to database`)

  const duration = (Date.now() - startTime) / 1000
  const successRate = results.length > 0 ? (inserted / results.length) * 100 : 0

  console.log('\n' + '='.repeat(60))
  console.log('📊 SCRAPER SUMMARY')
  console.log('='.repeat(60))
  console.log(`Store Brand: ${STORE_BRAND || 'ALL'}`)
  console.log(`Stores: ${stores.length}`)
  console.log(`Ingredients: ${ingredients.length}`)
  console.log(`Scraped: ${results.length}`)
  console.log(`Inserted: ${inserted}`)
  console.log(`Success Rate: ${successRate.toFixed(1)}%`)
  console.log(`Duration: ${duration.toFixed(1)}s`)
  console.log('='.repeat(60))

  if (inserted < results.length * 0.2) {
    console.error('\n❌ CRITICAL: <20% insertion success rate')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error)
  process.exit(1)
})
