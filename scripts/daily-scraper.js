#!/usr/bin/env node

/**
 * Daily Ingredient Scraper
 *
 * Runs via GitHub Actions to keep ingredient prices fresh
 * Uses the batch scraper API endpoint on Vercel
 */

const VERCEL_URL = process.env.VERCEL_URL || 'https://the-secret-sauce.vercel.app'
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET
const ZIP_CODE = process.env.ZIP_CODE || '94704'

// Configuration
const BATCH_SIZE = 10 // Process 10 ingredients per batch
const MAX_INGREDIENTS = 50 // Scrape top 50 ingredients

async function fetchTopIngredients() {
  console.log('📊 Fetching top ingredients from Supabase...')

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_top_ingredients`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ limit_count: MAX_INGREDIENTS })
      }
    )

    if (!response.ok) {
      // Fallback: fetch from standardized_ingredients table
      console.log('⚠️  RPC function not found, fetching from table...')
      const fallbackResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/standardized_ingredients?select=canonical_name&limit=${MAX_INGREDIENTS}`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
          }
        }
      )

      if (!fallbackResponse.ok) {
        throw new Error(`Failed to fetch ingredients: ${fallbackResponse.statusText}`)
      }

      const data = await fallbackResponse.json()
      return data.map(row => row.canonical_name)
    }

    const data = await response.json()
    return data.map(row => row.canonical_name || row.ingredient_name)
  } catch (error) {
    console.error('❌ Error fetching ingredients:', error.message)

    // Fallback to hardcoded common ingredients
    console.log('⚠️  Using fallback ingredient list...')
    return [
      'chicken breast',
      'ground beef',
      'eggs',
      'milk',
      'bread',
      'butter',
      'onions',
      'garlic',
      'tomatoes',
      'rice',
      'pasta',
      'olive oil',
      'salt',
      'pepper',
      'cheese',
      'potatoes',
      'carrots',
      'chicken thighs',
      'bacon',
      'flour'
    ]
  }
}

async function scrapeBatch(ingredients, batchNumber, totalBatches) {
  console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${ingredients.length} ingredients)`)

  const startTime = Date.now()

  try {
    const response = await fetch(`${VERCEL_URL}/api/batch-scraper`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`
      },
      body: JSON.stringify({
        ingredients: ingredients.map(name => ({ name })),
        zipCode: ZIP_CODE,
        forceRefresh: false // Use cache when possible
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Batch scraper failed: ${response.status} ${errorText}`)
    }

    const result = await response.json()
    const duration = Date.now() - startTime

    console.log(`✅ Batch ${batchNumber} complete in ${(duration / 1000).toFixed(1)}s`)
    console.log(`   Success: ${result.summary.successful}/${result.summary.totalAttempts}`)
    console.log(`   Cached: ${result.summary.cached}, Scraped: ${result.summary.scraped}, Failed: ${result.summary.failed}`)
    console.log(`   Success Rate: ${result.summary.successRate}`)

    return result
  } catch (error) {
    console.error(`❌ Batch ${batchNumber} failed:`, error.message)
    return {
      success: false,
      error: error.message,
      summary: {
        totalIngredients: ingredients.length,
        successful: 0,
        failed: ingredients.length * 8
      }
    }
  }
}

async function retryFailedStores(failedResults) {
  if (failedResults.length === 0) {
    console.log('\n✅ No failed stores to retry!')
    return
  }

  console.log(`\n🔄 Retrying ${failedResults.length} failed ingredients...`)

  // Process retries in smaller batches
  const retryBatchSize = 5
  const retryBatches = []

  for (let i = 0; i < failedResults.length; i += retryBatchSize) {
    retryBatches.push(failedResults.slice(i, i + retryBatchSize))
  }

  for (let i = 0; i < retryBatches.length; i++) {
    const batch = retryBatches[i]
    console.log(`\n🔄 Retry batch ${i + 1}/${retryBatches.length}`)

    await scrapeBatch(
      batch.map(r => r.ingredient),
      i + 1,
      retryBatches.length
    )

    // Add delay between retry batches to avoid rate limiting
    if (i < retryBatches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function main() {
  const startTime = Date.now()

  console.log('🚀 Daily Ingredient Scraper Starting...')
  console.log(`   Vercel URL: ${VERCEL_URL}`)
  console.log(`   Zip Code: ${ZIP_CODE}`)
  console.log(`   Max Ingredients: ${MAX_INGREDIENTS}`)
  console.log(`   Batch Size: ${BATCH_SIZE}`)

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (!CRON_SECRET) {
    console.error('❌ Missing CRON_SECRET')
    process.exit(1)
  }

  // Fetch ingredients
  const ingredients = await fetchTopIngredients()
  console.log(`✅ Found ${ingredients.length} ingredients to scrape`)

  // Split into batches
  const batches = []
  for (let i = 0; i < ingredients.length; i += BATCH_SIZE) {
    batches.push(ingredients.slice(i, i + BATCH_SIZE))
  }

  console.log(`📦 Split into ${batches.length} batches\n`)

  // Process all batches in parallel (with some concurrency limit)
  const MAX_CONCURRENT_BATCHES = 3
  const results = []

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES)
    const batchPromises = concurrentBatches.map((batch, idx) =>
      scrapeBatch(batch, i + idx + 1, batches.length)
    )

    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)

    // Add small delay between concurrent batch groups
    if (i + MAX_CONCURRENT_BATCHES < batches.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // Calculate totals
  const totalSuccessful = results.reduce((sum, r) => sum + (r.summary?.successful || 0), 0)
  const totalCached = results.reduce((sum, r) => sum + (r.summary?.cached || 0), 0)
  const totalScraped = results.reduce((sum, r) => sum + (r.summary?.scraped || 0), 0)
  const totalFailed = results.reduce((sum, r) => sum + (r.summary?.failed || 0), 0)
  const totalAttempts = results.reduce((sum, r) => sum + (r.summary?.totalAttempts || 0), 0)

  // Find ingredients with high failure rates for retry
  const failedIngredients = []
  results.forEach(result => {
    if (result.results) {
      result.results.forEach(ingredientResult => {
        if (ingredientResult.failedStores > 4) { // More than half failed
          failedIngredients.push(ingredientResult)
        }
      })
    }
  })

  // Retry failed stores
  if (failedIngredients.length > 0 && failedIngredients.length < 20) {
    await retryFailedStores(failedIngredients)
  }

  const duration = Date.now() - startTime

  console.log('\n' + '='.repeat(60))
  console.log('📊 DAILY SCRAPER SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total Ingredients: ${ingredients.length}`)
  console.log(`Total Stores: 8`)
  console.log(`Total Attempts: ${totalAttempts}`)
  console.log(`Successful: ${totalSuccessful} (${((totalSuccessful / totalAttempts) * 100).toFixed(1)}%)`)
  console.log(`  - From Cache: ${totalCached}`)
  console.log(`  - Freshly Scraped: ${totalScraped}`)
  console.log(`Failed: ${totalFailed}`)
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`)
  console.log('='.repeat(60))

  if (totalSuccessful === 0) {
    console.error('\n❌ CRITICAL: All scraping failed!')
    process.exit(1)
  }

  if (totalFailed > totalSuccessful) {
    console.warn('\n⚠️  WARNING: More failures than successes')
    process.exit(1)
  }

  console.log('\n✅ Daily scraper completed successfully!')
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error)
  process.exit(1)
})
