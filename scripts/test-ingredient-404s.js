#!/usr/bin/env node

/**
 * Ingredient 404 Testing Tool
 *
 * Tests a sample of ingredients against a known-good Target store to identify
 * which ingredient names consistently return 404 errors.
 *
 * This helps identify:
 * - Ingredients that Target doesn't recognize
 * - Ingredient names that need aliases or alternative search terms
 * - Whether 404s are ingredient-specific or store-specific
 *
 * Usage:
 *   node scripts/test-ingredient-404s.js [limit] [--high-404]
 *
 * Examples:
 *   node scripts/test-ingredient-404s.js           # Test 50 random ingredients
 *   node scripts/test-ingredient-404s.js 100       # Test 100 random ingredients
 *   node scripts/test-ingredient-404s.js 30 --high-404  # Test 30 ingredients with most 404s
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Import Target scraper
const scrapers = require('../lib/scrapers')

// Use a known-good Target store for testing
const TEST_ZIP = process.env.TARGET_TEST_ZIP || '94704'
const TEST_STORE_ID = process.env.TARGET_TEST_STORE_ID || '1823'

async function testIngredients(options = {}) {
  const {
    limit = 50,
    sampleStrategy = 'random' // 'random' | 'high_404'
  } = options

  console.log(`\n🧪 Testing ingredients for 404s (sample: ${limit}, strategy: ${sampleStrategy})...`)
  console.log(`   Using test store: ${TEST_STORE_ID} (ZIP: ${TEST_ZIP})\n`)

  let ingredientQuery = supabase
    .from('standardized_ingredients')
    .select('id, canonical_name')
    .not('canonical_name', 'is', null)

  // If high-404 strategy, get ingredients with most 404s
  if (sampleStrategy === 'high_404') {
    const { data: high404Ingredients } = await supabase
      .from('target_404_log')
      .select('ingredient_name')
      .gte('scraped_at', 'now() - interval \'7 days\'')

    if (high404Ingredients && high404Ingredients.length > 0) {
      // Count occurrences
      const counts = high404Ingredients.reduce((acc, row) => {
        acc[row.ingredient_name] = (acc[row.ingredient_name] || 0) + 1
        return acc
      }, {})

      // Get top ingredients by 404 count
      const topIngredients = Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .slice(0, limit)

      console.log(`   Focusing on top ${topIngredients.length} ingredients with most 404s in last 7 days\n`)
      ingredientQuery = ingredientQuery.in('canonical_name', topIngredients)
    } else {
      console.log('   No 404 history found, falling back to random sample\n')
      ingredientQuery = ingredientQuery.limit(limit)
    }
  } else {
    ingredientQuery = ingredientQuery.limit(limit)
  }

  const { data: ingredients, error } = await ingredientQuery

  if (error) {
    console.error('❌ Error fetching ingredients:', error.message)
    throw error
  }

  if (!ingredients || ingredients.length === 0) {
    console.log('⚠️  No ingredients found')
    return { success: 0, failure_404: 0, failure_other: 0, problematic: [] }
  }

  console.log(`Testing ${ingredients.length} ingredients...\n`)

  const results = {
    success: 0,
    failure_404: 0,
    failure_other: 0,
    problematic: []
  }

  for (const ing of ingredients) {
    try {
      const products = await scrapers.getTargetProducts(
        ing.canonical_name,
        { target_store_id: TEST_STORE_ID },
        TEST_ZIP
      )

      if (products && products.length > 0) {
        results.success++
        console.log(`✅ ${ing.canonical_name}: ${products.length} results`)
      } else {
        results.failure_other++
        console.log(`⚠️  ${ing.canonical_name}: 0 results (empty, not 404)`)
      }
    } catch (err) {
      if (err.code === 'TARGET_HTTP_404' || err.status === 404) {
        results.failure_404++
        console.log(`❌ ${ing.canonical_name}: 404`)
        results.problematic.push({
          name: ing.canonical_name,
          id: ing.id,
          error: '404'
        })
      } else {
        results.failure_other++
        console.log(`⚠️  ${ing.canonical_name}: ${err.message}`)
        results.problematic.push({
          name: ing.canonical_name,
          id: ing.id,
          error: err.message
        })
      }
    }

    // Rate limit (800ms between requests = ~75 requests/minute)
    await new Promise(resolve => setTimeout(resolve, 800))
  }

  // Print summary
  const total = results.success + results.failure_404 + results.failure_other
  console.log('\n📊 INGREDIENT TEST SUMMARY:')
  console.log('='.repeat(60))
  console.log(`  Total Tested: ${total}`)
  console.log(`  ✅ Success: ${results.success} (${((results.success / total) * 100).toFixed(1)}%)`)
  console.log(`  ❌ 404 Errors: ${results.failure_404} (${((results.failure_404 / total) * 100).toFixed(1)}%)`)
  console.log(`  ⚠️  Other Errors/Empty: ${results.failure_other} (${((results.failure_other / total) * 100).toFixed(1)}%)`)
  console.log('='.repeat(60))

  // Show problematic ingredients
  if (results.problematic.length > 0) {
    const only404s = results.problematic.filter(p => p.error === '404')

    if (only404s.length > 0) {
      console.log(`\n🚨 Ingredients that consistently 404 (${only404s.length}):`)
      only404s.forEach(ing => {
        console.log(`  - ${ing.name}`)
      })
      console.log('')
    }

    const otherErrors = results.problematic.filter(p => p.error !== '404')
    if (otherErrors.length > 0) {
      console.log(`\n⚠️  Ingredients with other errors (${otherErrors.length}):`)
      otherErrors.slice(0, 10).forEach(ing => {
        console.log(`  - ${ing.name}: ${ing.error}`)
      })
      if (otherErrors.length > 10) {
        console.log(`  ... and ${otherErrors.length - 10} more`)
      }
      console.log('')
    }

    console.log('💡 Recommendations:')

    if (only404s.length > 0) {
      const rate404 = only404s.length / total
      if (rate404 > 0.1) {
        console.log(`  • ${(rate404 * 100).toFixed(1)}% of ingredients return 404s - consider:`)
        console.log('    - Creating ingredient aliases/alternative search terms')
        console.log('    - Excluding these ingredients from Target scraping')
        console.log('    - Checking if ingredient names need normalization')
      } else {
        console.log('  • Small percentage of 404s - likely just ingredients Target doesn\'t carry')
      }
    }

    if (results.failure_other > total * 0.2) {
      console.log(`  • High rate of empty results (${((results.failure_other / total) * 100).toFixed(1)}%) - may indicate:`)
      console.log('    - Ingredient names are too generic/vague')
      console.log('    - Test store location doesn\'t carry these items')
    }

    console.log('')
  } else {
    console.log('\n✅ All tested ingredients returned results!\n')
  }

  return results
}

// Parse command line arguments
const args = process.argv.slice(2)
const limit = args.length > 0 && !args[0].startsWith('--') ?
  parseInt(args[0]) : 50
const sampleStrategy = args.includes('--high-404') ? 'high_404' : 'random'

// Main execution
testIngredients({ limit, sampleStrategy })
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
  })
