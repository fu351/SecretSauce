import { normalizeStoreEnum, truncateText } from './utils.js'
import { getScraperConfigFromEnv } from './config.js'
import { appendBrandFailureMetadata, runDailyScraper } from './processor.js'

// ─── Summary printing ─────────────────────────────────────────────────────────

function printRunSummary({ config, storeCount, ingredientCount, scrapedCount, insertedCount, durationSecs }) {
  const successRate = scrapedCount > 0 ? (insertedCount / scrapedCount) * 100 : 0
  const insertLabel = config.dryRun ? 'Would Insert' : 'Inserted'

  console.log(`\n✅ Scraped ${scrapedCount} total products`)
  if (config.dryRun) {
    console.log(`\n[DRY RUN] Would insert ${insertedCount} rows to database`)
  } else {
    console.log(`\n✅ Inserted ${insertedCount} rows to database`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 SCRAPER SUMMARY')
  console.log('='.repeat(60))
  console.log(`Store Brand: ${config.storeBrand || 'ALL'}`)
  console.log(`Stores: ${storeCount}`)
  console.log(`Ingredients: ${ingredientCount}`)
  console.log(`Scraped: ${scrapedCount}`)
  console.log(`${insertLabel}: ${insertedCount}`)
  console.log(`Success Rate: ${successRate.toFixed(1)}%`)
  console.log(`Duration: ${durationSecs.toFixed(1)}s`)
  console.log('='.repeat(60))
}

function printDetailedStoreSummary(storeStats) {
  console.log('\n📋 DETAILED STORE SUMMARY')
  console.log('='.repeat(60))

  const slowestStores = [...storeStats]
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

  const totals = storeStats.reduce((acc, s) => {
    acc.totalErrors += s.errorCount
    acc.totalHitIngredients += s.ingredientsWithHits
    acc.totalIngredients += s.ingredientsAttempted
    acc.totalTarget404s += s.target404Count
    return acc
  }, { totalErrors: 0, totalHitIngredients: 0, totalIngredients: 0, totalTarget404s: 0 })

  const overallHitRate = totals.totalIngredients > 0
    ? ((totals.totalHitIngredients / totals.totalIngredients) * 100).toFixed(1)
    : '0.0'

  console.log('\nSummary Totals:')
  console.log(`  Ingredient hit rate: ${totals.totalHitIngredients}/${totals.totalIngredients} (${overallHitRate}%)`)
  console.log(`  Store errors: ${totals.totalErrors}`)
  console.log(`  Target 404 events: ${totals.totalTarget404s}`)
}

function printTarget404Summary(target404s) {
  console.log(`\n🔍 TARGET 404 SUMMARY: ${target404s.length} total`)

  const byStore = target404s.reduce((acc, e) => {
    const key = `${e.storeEnum}|${e.zipCode}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const byIngredient = target404s.reduce((acc, e) => {
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

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(config) {
  const startTime = Date.now()

  console.log('🚀 Daily Ingredient Scraper Starting...')
  console.log(`   Store Brand: ${config.storeBrand || 'ALL'}`)
  console.log(`   Dry Run: ${config.dryRun ? 'true' : 'false'}`)
  console.log(`   Summary Mode: ${config.summaryMode}`)
  console.log(`   Strategy: Direct RPC + store-batched scraping`)
  console.log(`   Store Concurrency: ${config.storeConcurrency}`)
  console.log(`   Default Batch Size: ${config.scraperBatchSize}`)
  console.log(`   Default Batch Concurrency: ${config.scraperBatchConcurrency}`)
  console.log(`   Max Consecutive Store Errors: ${config.maxConsecutiveStoreErrors > 0 ? config.maxConsecutiveStoreErrors : 'disabled'}`)
  console.log(`   Insert Batch Size: ${config.insertBatchSize}`)
  console.log(`   Insert Concurrency: ${config.insertConcurrency}`)
  console.log(`   Insert Queue Max: ${config.insertQueueMaxSize > 0 ? config.insertQueueMaxSize : 'unlimited'}`)
  console.log(`   Insert RPC Retries: ${config.insertRpcMaxRetries}`)

  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const { stores, ingredients, scrapedCount, insertedCount, scrapeStats } = await runDailyScraper(config)

  if (!stores.length) {
    if (config.storeBrand) {
      console.warn(`⚠️  No stores found for "${config.storeBrand}" with current filters, skipping job`)
      return
    }
    console.error('❌ No stores found for configured filters')
    process.exit(1)
  }

  if (!ingredients.length) {
    console.error('❌ No canonical ingredients found')
    process.exit(1)
  }

  const durationSecs = (Date.now() - startTime) / 1000

  printRunSummary({ config, storeCount: stores.length, ingredientCount: ingredients.length, scrapedCount, insertedCount, durationSecs })

  if (config.summaryMode === 'detailed' && scrapeStats.stores.length > 0) {
    printDetailedStoreSummary(scrapeStats.stores)
  }

  if (scrapeStats.target404s.length > 0) {
    printTarget404Summary(scrapeStats.target404s)
  }

  if (!config.dryRun && insertedCount < scrapedCount * 0.2) {
    console.error('\n❌ CRITICAL: <20% insertion success rate')
    process.exit(1)
  }
}

let shutdownSignalHandled = false

async function handleTerminationSignal(signal, config) {
  if (shutdownSignalHandled) return
  shutdownSignalHandled = true

  console.error(`\n⚠️ Received ${signal}; recording scraper failure logs before exit...`)

  const normalizedBrand = normalizeStoreEnum(config.storeBrand)
  if (normalizedBrand && config.supabaseUrl && config.supabaseServiceKey) {
    await appendBrandFailureMetadata(normalizedBrand, {
      errorCount: 1,
      consecutiveErrors: 1,
      skippedForErrors: false,
      lastErrorMessage: `Process terminated by ${signal}`,
      errorType: 'process_terminated',
      status: 'run_failed',
    }, config)
  }

  process.exit(1)
}

const config = getScraperConfigFromEnv()

process.on('SIGTERM', () => { void handleTerminationSignal('SIGTERM', config) })
process.on('SIGINT', () => { void handleTerminationSignal('SIGINT', config) })

main(config).catch(async error => {
  console.error('\n💥 Fatal error:', error)

  const normalizedBrand = normalizeStoreEnum(config.storeBrand)
  if (normalizedBrand) {
    await appendBrandFailureMetadata(normalizedBrand, {
      errorCount: 1,
      consecutiveErrors: 1,
      skippedForErrors: false,
      lastErrorMessage: error?.message || String(error),
      errorType: 'run_failure',
      status: 'run_failed',
    }, config)
  }

  process.exit(1)
})
