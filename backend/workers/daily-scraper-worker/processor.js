import {
  getProductName,
  mapWithConcurrency,
  normalizeStoreEnum,
  normalizeZipCode,
  sleep,
  toPriceNumber,
} from './utils.js'
import { STOP_REASON, ERROR_CODE } from './config.js'
import {
  toNonEmptyString,
  parseMetadataObject,
  appendStoreFailureMetadata,
  appendStoreHttp404Metadata,
  fetchStores,
  fetchAllCanonicalIngredients,
} from './db.js'
import { GlobalInsertQueue } from './insert-queue.js'
import { runBatchedScraperForStore } from './scrape.js'

// ─── Target store metadata normalization ─────────────────────────────────────

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
