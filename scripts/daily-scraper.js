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

async function fetchAllCanonicalIngredients() {
  console.log('📊 Fetching ALL canonical ingredients from Supabase...')

  try {
    // Fetch ALL canonical ingredients from standardized_ingredients table
    // This ensures we pre-populate cache for all ingredients, not just top 50
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/standardized_ingredients?select=canonical_name&order=canonical_name.asc`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch ingredients: ${response.statusText}`)
    }

    const data = await response.json()
    return data.map(row => row.canonical_name).filter(Boolean)
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

  console.log(`\n🔄 Retrying ${failedResults.length} ingredients with failures...`)

  // Fetch canonical names from database for all failed ingredients
  const ingredientNames = failedResults.map(r => r.ingredient)
  console.log('📊 Fetching canonical names for failed ingredients...')

  const canonicalMap = new Map()

  try {
    // Fetch canonical names from standardized_ingredients table
    const canonicalNames = await Promise.all(
      ingredientNames.map(async (name) => {
        // Apply same canonicalization logic as batch-scraper API
        const canonical = name
          .toLowerCase()
          .replace(/\(.*?\)/g, ' ')
          .replace(/[^a-z0-9\s]/g, ' ')
          .trim()
          .replace(/\s+/g, ' ')

        try {
          const response = await fetch(
            `${SUPABASE_URL}/rest/v1/standardized_ingredients?select=canonical_name&canonical_name=eq.${encodeURIComponent(canonical)}`,
            {
              headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
              }
            }
          )

          if (response.ok) {
            const data = await response.json()
            if (data.length > 0) {
              return { original: name, canonical: data[0].canonical_name }
            }
          }
        } catch (error) {
          console.warn(`⚠️  Could not fetch canonical name for "${name}":`, error.message)
        }

        // Fallback to computed canonical name
        return { original: name, canonical }
      })
    )

    // Build map of original -> canonical
    canonicalNames.forEach(({ original, canonical }) => {
      canonicalMap.set(original, canonical)
      if (original !== canonical) {
        console.log(`   "${original}" → "${canonical}"`)
      }
    })
  } catch (error) {
    console.error('❌ Error fetching canonical names:', error.message)
    console.log('⚠️  Falling back to original names for retry')
  }

  // Process retries in smaller batches with forceRefresh
  const retryBatchSize = 3 // Even smaller batches for retries
  const retryBatches = []

  for (let i = 0; i < failedResults.length; i += retryBatchSize) {
    retryBatches.push(failedResults.slice(i, i + retryBatchSize))
  }

  for (let i = 0; i < retryBatches.length; i++) {
    const batch = retryBatches[i]
    console.log(`\n🔄 Retry batch ${i + 1}/${retryBatches.length}`)

    // Retry with canonical names and forceRefresh
    const ingredients = batch.map(r => {
      const canonical = canonicalMap.get(r.ingredient) || r.ingredient
      return { name: canonical }
    })

    const response = await fetch(`${VERCEL_URL}/api/batch-scraper`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`
      },
      body: JSON.stringify({
        ingredients,
        zipCode: ZIP_CODE,
        forceRefresh: true // Force refresh on retry
      })
    })

    if (response.ok) {
      const result = await response.json()
      console.log(`✅ Retry batch ${i + 1} complete`)
      console.log(`   Success: ${result.summary.successful}/${result.summary.totalAttempts}`)
    }

    // Add longer delay between retry batches to avoid rate limiting
    if (i < retryBatches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // 5s delay between retry batches
    }
  }
}

async function main() {
  const startTime = Date.now()

  console.log('🚀 Daily Ingredient Scraper Starting...')
  console.log(`   Vercel URL: ${VERCEL_URL}`)
  console.log(`   Zip Code: ${ZIP_CODE}`)
  console.log(`   Batch Size: ${BATCH_SIZE}`)
  console.log(`   Strategy: Pre-populate cache with ALL canonical ingredients`)

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (!CRON_SECRET) {
    console.error('❌ Missing CRON_SECRET')
    process.exit(1)
  }

  // Fetch ALL canonical ingredients
  const ingredients = await fetchAllCanonicalIngredients()
  console.log(`✅ Found ${ingredients.length} canonical ingredients to scrape`)

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

    // Add delay between concurrent batch groups to avoid rate limiting
    if (i + MAX_CONCURRENT_BATCHES < batches.length) {
      await new Promise(resolve => setTimeout(resolve, 3000)) // Increased from 1s to 3s
    }
  }

  // Calculate totals
  const totalSuccessful = results.reduce((sum, r) => sum + (r.summary?.successful || 0), 0)
  const totalCached = results.reduce((sum, r) => sum + (r.summary?.cached || 0), 0)
  const totalScraped = results.reduce((sum, r) => sum + (r.summary?.scraped || 0), 0)
  const totalFailed = results.reduce((sum, r) => sum + (r.summary?.failed || 0), 0)
  const totalAttempts = results.reduce((sum, r) => sum + (r.summary?.totalAttempts || 0), 0)

  // Find ALL ingredients with any failures for retry (more aggressive)
  const failedIngredients = []
  results.forEach(result => {
    if (result.results) {
      result.results.forEach(ingredientResult => {
        if (ingredientResult.failedStores > 0) { // Retry ANY failures
          failedIngredients.push(ingredientResult)
        }
      })
    }
  })

  // Retry failed stores with longer delay
  if (failedIngredients.length > 0) {
    console.log(`\n⏸️  Waiting 5 seconds before retrying ${failedIngredients.length} ingredients with failures...`)
    await new Promise(resolve => setTimeout(resolve, 5000)) // 5s delay before retries
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
