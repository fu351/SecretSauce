import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import {
  buildStoreFilterContext,
  getBooleanEnv,
  getIntEnv,
} from './utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '../../.env.local') })
dotenv.config({ path: path.join(__dirname, '../../.env') })

// ─── Error / stop-reason constants ───────────────────────────────────────────

export const STOP_REASON = {
  HTTP_404: 'http_404',
  AUTH_BLOCKED: 'auth_blocked',
  CONSECUTIVE_ERRORS: 'consecutive_errors',
}

export const ERROR_CODE = {
  KROGER_AUTH_BLOCKED: 'KROGER_AUTH_BLOCKED',
  KROGER_AUTH_MISSING_CREDS: 'KROGER_AUTH_MISSING_CREDS',
  HTTP_404: 'HTTP_404',
  SCRAPER_NOT_CONFIGURED: 'SCRAPER_NOT_CONFIGURED',
}

// ─────────────────────────────────────────────────────────────────────────────

export function getScraperConfigFromEnv() {
  const insertBatchSize = getIntEnv('INSERT_BATCH_SIZE', 300, 1)
  const insertConcurrency = getIntEnv('INSERT_CONCURRENCY', 2, 1)
  const storeConcurrency = getIntEnv('STORE_CONCURRENCY', 20, 1)
  const storeState = process.env.STORE_STATE || null
  const storeCity = process.env.STORE_CITY || null
  const storeCitiesCsv = process.env.STORE_CITIES_CSV || null
  const storeZipMin = process.env.STORE_ZIP_MIN || null
  const storeZipMax = process.env.STORE_ZIP_MAX || null

  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

    storeBrand: process.env.STORE_BRAND || null,
    storeCity,
    storeState,
    storeCitiesCsv,
    storeZipMin,
    storeZipMax,
    storeFilterContext: buildStoreFilterContext({ storeState, storeCity, storeCitiesCsv, storeZipMin, storeZipMax }),

    dryRun: getBooleanEnv('DAILY_SCRAPER_DRY_RUN', getBooleanEnv('DRY_RUN', false)),
    summaryMode: String(process.env.DAILY_SCRAPER_SUMMARY_MODE || 'basic').trim().toLowerCase() === 'detailed'
      ? 'detailed'
      : 'basic',

    preferredStoresOnly: getBooleanEnv('PREFERRED_STORES_ONLY', true),

    ingredientLimit: getIntEnv('INGREDIENT_LIMIT', 0, 0),
    storeLimit: getIntEnv('STORE_LIMIT', 0, 0),
    storeConcurrency,
    ingredientDelayMs: getIntEnv('INGREDIENT_DELAY_MS', 1000, 0),
    scraperBatchSize: getIntEnv('SCRAPER_BATCH_SIZE', 20, 1),
    scraperBatchConcurrency: getIntEnv('SCRAPER_BATCH_CONCURRENCY', storeConcurrency, 1),
    maxConsecutiveStoreErrors: getIntEnv('MAX_CONSECUTIVE_STORE_ERRORS', 10, 0),

    insertBatchSize,
    insertConcurrency,
    // Default: 4 full batches per insert slot — enough buffer to keep all insert
    // workers busy without letting the queue grow unbounded under a fast producer.
    insertQueueMaxSize: getIntEnv('INSERT_QUEUE_MAX_SIZE', insertBatchSize * insertConcurrency * 4, 0),
    insertRpcMaxRetries: getIntEnv('INSERT_RPC_MAX_RETRIES', 3, 0),
    insertRpcRetryBaseDelayMs: getIntEnv('INSERT_RPC_RETRY_BASE_DELAY_MS', 1000, 0),
    insertRpcRetryMaxDelayMs: getIntEnv('INSERT_RPC_RETRY_MAX_DELAY_MS', 10000, 0),

    pageSize: 1000,
  }
}
