import { createRequire } from 'node:module'
import {
  emptyBatchResults,
  mapWithConcurrency,
  normalizeBatchResultsShape,
  normalizeResultsShape,
  parseCooldownMsFromMessage,
  runBatchWithCooldownRetry,
  sleep,
  truncateText,
} from './utils.js'
import { ERROR_CODE } from './config.js'

const require = createRequire(import.meta.url)
const scrapers = require('../scraper-worker')

const SCRAPER_MAP = {
  walmart: scrapers.searchWalmartAPI,
  safeway: scrapers.searchSafeway,
  andronicos: scrapers.searchAndronicos,
  traderjoes: scrapers.searchTraderJoes,
  wholefoods: scrapers.searchWholeFoods,
  whole_foods: scrapers.searchWholeFoods,
  aldi: scrapers.searchAldi,
  kroger: (query, zip) => scrapers.searchKroger(zip, query),
  meijer: (query, zip) => scrapers.searchMeijer(zip, query),
  target: (query, zip) => scrapers.searchTarget(query, null, zip),
  ranch99: scrapers.search99Ranch,
  '99ranch': scrapers.search99Ranch,
}

const STORE_BATCH_SCRAPER_MAP = {
  traderjoes: scrapers.searchTraderJoesBatch,
  kroger: (keywords, zip, opts) => scrapers.searchKrogerBatch(keywords, zip, opts),
  meijer: scrapers.searchMeijerBatch,
  ranch99: scrapers.search99RanchBatch,
  '99ranch': scrapers.search99RanchBatch,
}

export async function runBatchedScraperForStore(storeEnum, ingredientChunk, zipCode, batchConcurrency, scrapeStats, storeMetadata) {
  const nativeBatchScraper = STORE_BATCH_SCRAPER_MAP[storeEnum]
  const normalizedTargetMetadata = storeEnum === 'target' ? storeMetadata : null

  if (typeof nativeBatchScraper === 'function') {
    try {
      const nativeResults = await nativeBatchScraper(ingredientChunk, zipCode, { concurrency: batchConcurrency })
      return {
        resultsByIngredient: normalizeBatchResultsShape(nativeResults, ingredientChunk.length),
        errorFlags: Array.from({ length: ingredientChunk.length }, () => false),
        errorMessages: Array.from({ length: ingredientChunk.length }, () => ''),
        http404Flags: Array.from({ length: ingredientChunk.length }, () => false),
        errorCodes: Array.from({ length: ingredientChunk.length }, () => ''),
      }
    } catch (error) {
      const message = error?.message || String(error)
      const code = String(error?.code || '')
      const normalizedCode = code.toLowerCase()
      const normalizedMessage = message.toLowerCase()
      const isRateLimitFailure =
        normalizedCode.includes('rate_limit') ||
        normalizedCode.includes('cooldown') ||
        normalizedCode.includes('429') ||
        normalizedCode.includes('jina') ||
        normalizedMessage.includes('429') ||
        normalizedMessage.includes('rate limit') ||
        normalizedMessage.includes('cooldown active') ||
        normalizedMessage.includes('jina cooldown')

      if (isRateLimitFailure) {
        const cooldownRemainingMs = parseCooldownMsFromMessage(message)
        if (cooldownRemainingMs > 0) {
          console.warn(
            `⚠️ Native batch scraper rate-limited for ${storeEnum}: ${message}. ` +
            `Sleeping ${Math.min(cooldownRemainingMs + 2000, 120000)}ms for cooldown to expire, then retrying chunk...`
          )
        } else {
          console.warn(
            `⚠️ Native batch scraper rate-limited for ${storeEnum}: ${message}. ` +
            'Marking chunk as errors to avoid retry storms.'
          )
        }
        const result = await runBatchWithCooldownRetry({
          runBatch: () => nativeBatchScraper(ingredientChunk, zipCode, { concurrency: batchConcurrency }),
          storeEnum,
          message,
          code,
          ingredientCount: ingredientChunk.length,
          sleepFn: sleep,
        })
        if (!result._retrySucceeded && cooldownRemainingMs > 0) {
          console.warn(`⚠️ Retry after cooldown also failed for ${storeEnum}. Marking chunk as errors.`)
        }
        const { _retrySucceeded: _, ...chunkResult } = result
        return chunkResult
      }

      console.warn(`⚠️ Native batch scraper failed for ${storeEnum}: ${message}. Falling back to chunked single calls.`)
    }
  }

  const singleScraper = SCRAPER_MAP[storeEnum]
  if (typeof singleScraper !== 'function') {
    console.warn(`⚠️ No scraper configured for "${storeEnum}"`)
    return {
      resultsByIngredient: emptyBatchResults(ingredientChunk.length),
      errorFlags: Array.from({ length: ingredientChunk.length }, () => true),
      errorMessages: Array.from({ length: ingredientChunk.length }, () => `No scraper configured for ${storeEnum}`),
      http404Flags: Array.from({ length: ingredientChunk.length }, () => false),
      errorCodes: Array.from({ length: ingredientChunk.length }, () => ERROR_CODE.SCRAPER_NOT_CONFIGURED),
    }
  }

  const chunkResults = await mapWithConcurrency(
    ingredientChunk,
    batchConcurrency,
    async ingredientName => {
      try {
        const results = storeEnum === 'target'
          ? await scrapers.searchTarget(ingredientName, normalizedTargetMetadata, zipCode)
          : await singleScraper(ingredientName, zipCode)

        return { results, hadError: false, errorMessage: '', isHttp404: false, errorCode: '' }
      } catch (error) {
        const message = error?.message || String(error)
        const status = error?.status ?? error?.response?.status
        const code = String(error?.code || '').toUpperCase()
        const isTarget404 = storeEnum === 'target' && (status === 404 || code === `TARGET_${ERROR_CODE.HTTP_404}`)
        const isHttp404 = status === 404 || code.includes('404')
        const isFatalAuthBlocked = code === ERROR_CODE.KROGER_AUTH_BLOCKED || code === ERROR_CODE.KROGER_AUTH_MISSING_CREDS

        if (isTarget404) {
          console.warn(
            `⚠️ Target 404 for ${storeEnum} (${zipCode}) ingredient "${ingredientName}" - stopping this store scrape`
          )
          if (scrapeStats?.target404s) {
            scrapeStats.target404s.push({ storeEnum, zipCode, ingredientName, timestamp: new Date().toISOString() })
          }
        }

        if (isHttp404) {
          return { results: [], hadError: true, errorMessage: message, isHttp404: true, errorCode: code || ERROR_CODE.HTTP_404 }
        }

        console.error(`❌ Scraper failed for ${storeEnum} (${zipCode}) ingredient "${ingredientName}": ${message}`)
        if (isFatalAuthBlocked) {
          return { results: [], hadError: true, errorMessage: message, isHttp404: false, errorCode: code }
        }

        return { results: [], hadError: true, errorMessage: message, isHttp404: false, errorCode: code || '' }
      }
    }
  )

  return {
    resultsByIngredient: chunkResults.map(entry => normalizeResultsShape(entry?.results)),
    errorFlags: chunkResults.map(entry => Boolean(entry?.hadError)),
    errorMessages: chunkResults.map(entry => truncateText(entry?.errorMessage || '')),
    http404Flags: chunkResults.map(entry => Boolean(entry?.isHttp404)),
    errorCodes: chunkResults.map(entry => truncateText(entry?.errorCode || '')),
  }
}
