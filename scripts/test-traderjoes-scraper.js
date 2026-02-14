#!/usr/bin/env node

/**
 * Trader Joe's scraper integration test (daily-scraper-style)
 *
 * Goals:
 * - Mirror daily-scraper control flow enough to validate runtime behavior.
 * - Force scraping to exactly one Trader Joe's store.
 * - Validate result shape and single-store location consistency.
 *
 * Usage:
 *   node scripts/test-traderjoes-scraper.js
 *
 * Optional env:
 *   TRADERJOES_TEST_ZIP=94703
 *   TRADERJOES_TEST_INGREDIENT_LIMIT=8
 *   TRADERJOES_TEST_BATCH_SIZE=4
 *   TRADERJOES_TEST_BATCH_CONCURRENCY=2
 *   TRADERJOES_TEST_DELAY_MS=250
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import {
  emptyBatchResults,
  getIntEnv,
  mapWithConcurrency,
  normalizeBatchResultsShape,
  normalizeResultsShape,
  normalizeStoreEnum,
  normalizeZipCode,
  truncateText,
} from './utils/daily-scraper-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const scrapers = require('../lib/scrapers')
const { fetchJinaReader } = require('../lib/scrapers/jina-client')

dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const STORE_BRAND = 'traderjoes'
const STORE_LIMIT = 1 // Hard requirement from this test: only scrape one store.
const TEST_ZIP = normalizeZipCode(process.env.TRADERJOES_TEST_ZIP || '')
const INGREDIENT_LIMIT = getIntEnv('TRADERJOES_TEST_INGREDIENT_LIMIT', 6, 1)
const SCRAPER_BATCH_SIZE = getIntEnv('TRADERJOES_TEST_BATCH_SIZE', 3, 1)
const SCRAPER_BATCH_CONCURRENCY = getIntEnv('TRADERJOES_TEST_BATCH_CONCURRENCY', 2, 1)
const INGREDIENT_DELAY_MS = getIntEnv('TRADERJOES_TEST_DELAY_MS', 200, 0)
const PRINT_PRODUCT_METADATA = String(process.env.TRADERJOES_TEST_PRINT_METADATA || 'true').toLowerCase() !== 'false'
const PRINT_PRE_LLM_RAW = String(process.env.TRADERJOES_TEST_PRINT_PRE_LLM_RAW || 'false').toLowerCase() === 'true'
const RAW_PREVIEW_CHARS = getIntEnv('TRADERJOES_TEST_RAW_PREVIEW_CHARS', 2500, 200)
const RAW_OUTPUT_DIR = process.env.TRADERJOES_TEST_RAW_OUTPUT_DIR || path.join(__dirname, 'output', 'traderjoes-raw')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'ingredient'
}

async function fetchRawTraderJoesSearchContent(keyword) {
  const searchUrl = `https://www.traderjoes.com/home/search?q=${encodeURIComponent(keyword)}&section=products&global=yes`
  const jinaReaderUrl = `https://r.jina.ai/${searchUrl}`
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  }

  const response = await fetchJinaReader(jinaReaderUrl, {
    headers,
    timeoutMs: 25000,
  })

  return String(response?.data || '')
}

function isPriceSortedAscending(items) {
  for (let i = 1; i < items.length; i += 1) {
    const prev = Number(items[i - 1]?.price)
    const curr = Number(items[i]?.price)
    if (Number.isFinite(prev) && Number.isFinite(curr) && prev > curr) {
      return false
    }
  }
  return true
}

function validateProductShape(product, ingredientName, index) {
  const title = product?.product_name || product?.title || product?.name
  const price = Number(product?.price)
  const location = String(product?.location || '').trim()
  const provider = String(product?.provider || '').trim().toLowerCase()

  const failures = []
  if (!title) failures.push(`[${index}] missing product name for "${ingredientName}"`)
  if (!Number.isFinite(price) || price <= 0) failures.push(`[${index}] invalid price for "${ingredientName}": ${product?.price}`)
  if (!location) failures.push(`[${index}] missing location for "${ingredientName}"`)
  if (!provider.includes('trader joe')) failures.push(`[${index}] provider is not Trader Joe's for "${ingredientName}": ${product?.provider || 'N/A'}`)

  return failures
}

async function fetchSingleTraderJoesStore() {
  let query = supabase
    .from('grocery_stores')
    .select('id, store_enum, zip_code, name, address')
    .eq('is_active', true)
    .eq('store_enum', STORE_BRAND)
    .not('zip_code', 'is', null)
    .order('zip_code', { ascending: true })
    .limit(STORE_LIMIT)

  if (TEST_ZIP) {
    query = query.like('zip_code', `${TEST_ZIP}%`)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch store: ${error.message}`)
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`Expected exactly 1 ${STORE_BRAND} store, received ${data?.length || 0}`)
  }

  const store = data[0]
  const storeEnum = normalizeStoreEnum(store.store_enum)
  const zipCode = normalizeZipCode(store.zip_code)

  if (storeEnum !== STORE_BRAND) {
    throw new Error(`Unexpected store_enum: ${store.store_enum}`)
  }

  if (!zipCode) {
    throw new Error(`Store ${store.id} has invalid ZIP: ${store.zip_code}`)
  }

  return {
    ...store,
    store_enum: storeEnum,
    zip_code: zipCode,
  }
}

async function fetchCanonicalIngredients(limit) {
  const { data, error } = await supabase
    .from('standardized_ingredients')
    .select('canonical_name')
    .not('canonical_name', 'is', null)
    .order('canonical_name', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch ingredients: ${error.message}`)
  }

  const ingredients = (data || [])
    .map(row => String(row.canonical_name || '').trim())
    .filter(Boolean)

  if (ingredients.length === 0) {
    throw new Error('No canonical ingredients found for test')
  }

  return ingredients
}

async function runBatchedTraderJoesScrape(ingredientChunk, zipCode) {
  const nativeBatchScraper = scrapers.searchTraderJoesBatch

  if (typeof nativeBatchScraper === 'function') {
    try {
      const nativeResults = await nativeBatchScraper(ingredientChunk, zipCode, {
        concurrency: SCRAPER_BATCH_CONCURRENCY,
      })

      return {
        resultsByIngredient: normalizeBatchResultsShape(nativeResults, ingredientChunk.length),
        errorFlags: Array.from({ length: ingredientChunk.length }, () => false),
        errorMessages: Array.from({ length: ingredientChunk.length }, () => ''),
      }
    } catch (error) {
      const message = error?.message || String(error)
      console.warn(`⚠️ Native Trader Joe's batch failed: ${truncateText(message)}. Falling back to single calls.`)
    }
  }

  if (typeof scrapers.searchTraderJoes !== 'function') {
    return {
      resultsByIngredient: emptyBatchResults(ingredientChunk.length),
      errorFlags: Array.from({ length: ingredientChunk.length }, () => true),
      errorMessages: Array.from({ length: ingredientChunk.length }, () => 'searchTraderJoes is not configured'),
    }
  }

  const chunkResults = await mapWithConcurrency(
    ingredientChunk,
    SCRAPER_BATCH_CONCURRENCY,
    async ingredientName => {
      try {
        const results = await scrapers.searchTraderJoes(ingredientName, zipCode)
        return {
          results,
          hadError: false,
          errorMessage: '',
        }
      } catch (error) {
        const message = error?.message || String(error)
        return {
          results: [],
          hadError: true,
          errorMessage: message,
        }
      }
    }
  )

  return {
    resultsByIngredient: chunkResults.map(entry => normalizeResultsShape(entry?.results)),
    errorFlags: chunkResults.map(entry => Boolean(entry?.hadError)),
    errorMessages: chunkResults.map(entry => truncateText(entry?.errorMessage || '')),
  }
}

async function run() {
  console.log('\n' + '='.repeat(80))
  console.log("TRADER JOE'S SCRAPER TEST (DAILY-SCRAPER STYLE)")
  console.log('='.repeat(80))
  console.log(`Store brand: ${STORE_BRAND}`)
  console.log(`Store limit: ${STORE_LIMIT} (hard enforced)`)
  if (TEST_ZIP) {
    console.log(`Store ZIP filter: ${TEST_ZIP}`)
  }
  console.log(`Ingredient limit: ${INGREDIENT_LIMIT}`)
  console.log(`Batch size: ${SCRAPER_BATCH_SIZE}`)
  console.log(`Batch concurrency: ${SCRAPER_BATCH_CONCURRENCY}`)
  if (PRINT_PRE_LLM_RAW) {
    console.log(`Pre-LLM raw capture: enabled`)
    console.log(`Raw output dir: ${RAW_OUTPUT_DIR}`)
  }

  const store = await fetchSingleTraderJoesStore()
  const ingredients = await fetchCanonicalIngredients(INGREDIENT_LIMIT)

  if (PRINT_PRE_LLM_RAW) {
    await fs.mkdir(RAW_OUTPUT_DIR, { recursive: true })
  }

  console.log(`\n🏬 Using single store: ${store.name || 'Trader Joe\'s'} (${store.zip_code}) [${store.id}]`)
  console.log(`🧪 Testing ${ingredients.length} ingredient(s)`)

  const failures = []
  const warnings = []
  let totalProducts = 0
  let ingredientsWithResults = 0

  for (let i = 0; i < ingredients.length; i += SCRAPER_BATCH_SIZE) {
    const chunk = ingredients.slice(i, i + SCRAPER_BATCH_SIZE)
    const chunkLabel = `${i + 1}-${Math.min(i + chunk.length, ingredients.length)}`
    console.log(`\n📦 Batch ${chunkLabel}/${ingredients.length}`)

    if (PRINT_PRE_LLM_RAW) {
      console.log(`   🧾 Fetching pre-LLM raw payloads for ${chunk.length} ingredient(s)...`)
      const rawEntries = await mapWithConcurrency(
        chunk,
        SCRAPER_BATCH_CONCURRENCY,
        async ingredientName => {
          try {
            const rawContent = await fetchRawTraderJoesSearchContent(ingredientName)
            const filePath = path.join(RAW_OUTPUT_DIR, `${slugify(ingredientName)}.md`)
            await fs.writeFile(filePath, rawContent, 'utf8')
            return { ingredientName, rawContent, filePath, error: null }
          } catch (error) {
            return { ingredientName, rawContent: '', filePath: '', error: error?.message || String(error) }
          }
        }
      )

      rawEntries.forEach(entry => {
        if (entry.error) {
          warnings.push(`⚠️ ${entry.ingredientName}: failed to fetch pre-LLM raw payload (${entry.error})`)
          return
        }

        const preview = entry.rawContent.slice(0, RAW_PREVIEW_CHARS)
        console.log(`\n   🧾 Raw pre-LLM payload for "${entry.ingredientName}"`)
        console.log(`      saved: ${entry.filePath}`)
        console.log('      preview:')
        preview.split('\n').forEach(line => {
          console.log(`      ${line}`)
        })
      })
    }

    const { resultsByIngredient, errorFlags, errorMessages } = await runBatchedTraderJoesScrape(chunk, store.zip_code)

    for (let idx = 0; idx < chunk.length; idx += 1) {
      const ingredientName = chunk[idx]
      const results = resultsByIngredient[idx] || []

      if (errorFlags[idx]) {
        failures.push(`❌ ${ingredientName}: scraper error - ${errorMessages[idx] || 'Unknown error'}`)
        continue
      }

      if (!results.length) {
        warnings.push(`⚠️ ${ingredientName}: no products returned`)
        continue
      }

      ingredientsWithResults += 1
      totalProducts += results.length

      const shapeFailures = []
      for (let productIndex = 0; productIndex < results.length; productIndex += 1) {
        shapeFailures.push(...validateProductShape(results[productIndex], ingredientName, productIndex))
      }

      if (shapeFailures.length > 0) {
        failures.push(...shapeFailures)
      }

      if (!isPriceSortedAscending(results)) {
        failures.push(`❌ ${ingredientName}: results are not sorted by ascending price`)
      }

      const distinctLocations = new Set(
        results
          .map(item => String(item?.location || '').trim())
          .filter(Boolean)
      )

      if (distinctLocations.size > 1) {
        failures.push(
          `❌ ${ingredientName}: expected single-store location, got ${distinctLocations.size} locations (${Array.from(distinctLocations).join(', ')})`
        )
      }

      if (distinctLocations.size === 1 && !Array.from(distinctLocations)[0].toLowerCase().includes('trader joe')) {
        warnings.push(`⚠️ ${ingredientName}: location does not include Trader Joe's (${Array.from(distinctLocations)[0]})`)
      }

      console.log(`   ✅ ${ingredientName}: ${results.length} products`)
      if (PRINT_PRODUCT_METADATA) {
        console.log(`   📋 Product metadata for "${ingredientName}":`)
        results.forEach((product, productIndex) => {
          console.log(`      [${productIndex + 1}] ${JSON.stringify(product)}`)
        })
      }
    }

    if (INGREDIENT_DELAY_MS > 0 && i + SCRAPER_BATCH_SIZE < ingredients.length) {
      await sleep(INGREDIENT_DELAY_MS)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Store processed: 1`)
  console.log(`Ingredients tested: ${ingredients.length}`)
  console.log(`Ingredients with results: ${ingredientsWithResults}`)
  console.log(`Total products observed: ${totalProducts}`)
  console.log(`Failures: ${failures.length}`)
  console.log(`Warnings: ${warnings.length}`)

  if (warnings.length > 0) {
    console.log('\nWarnings:')
    warnings.slice(0, 20).forEach(item => console.log(`  ${item}`))
    if (warnings.length > 20) {
      console.log(`  ... and ${warnings.length - 20} more`)
    }
  }

  if (failures.length > 0) {
    console.log('\nFailures:')
    failures.slice(0, 30).forEach(item => console.log(`  ${item}`))
    if (failures.length > 30) {
      console.log(`  ... and ${failures.length - 30} more`)
    }
    process.exit(1)
  }

  console.log('\n✅ Trader Joe\'s scraper test passed for single-store mode.')
}

run().catch(error => {
  console.error('\n💥 Trader Joe\'s test crashed:', error?.message || error)
  process.exit(1)
})
