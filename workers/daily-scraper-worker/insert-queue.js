import {
  normalizeStoreEnum,
  normalizeZipCode,
  toPriceNumber,
  sleep,
  truncateText,
} from './utils.js'
import { getSupabase } from './db.js'

// ─── Dedup key ────────────────────────────────────────────────────────────────

function normalizeProductNameForDedupe(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function buildInsertDedupKey(item) {
  const store = normalizeStoreEnum(item?.store)
  const zipCode = normalizeZipCode(item?.zipCode)
  const productId = item?.productId != null ? String(item.productId).trim() : null

  if (productId) {
    return `${store}|${zipCode}|id|${productId}`
  }

  const productName = normalizeProductNameForDedupe(item?.productName)
  const price = toPriceNumber(item?.price)
  if (!productName || price === null) {
    return ''
  }

  return `${store}|${zipCode}|name|${productName}|price|${price.toFixed(2)}`
}

// ─── RPC helpers ──────────────────────────────────────────────────────────────

function getRpcErrorText(error) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.cause?.message,
  ]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase()
}

function isTransientRpcError(error) {
  const text = getRpcErrorText(error)
  if (!text) return false

  return (
    text.includes('fetch failed') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('eai_again') ||
    text.includes('enotfound') ||
    text.includes('socket hang up') ||
    text.includes('connection terminated') ||
    text.includes('network') ||
    text.includes('timeout') ||
    text.includes('429') ||
    text.includes('502') ||
    text.includes('503') ||
    text.includes('504')
  )
}

// Recursively insert a pre-normalized payload slice, splitting on timeout.
// splitDepth tracks how many times we've halved to aid log readability.
async function insertPayload(slice, splitDepth, config) {
  const label = splitDepth > 0 ? ` [split depth ${splitDepth}]` : ''

  for (let attempt = 0; attempt <= config.insertRpcMaxRetries; attempt += 1) {
    if (attempt === 0) {
      console.log(`💾${label} Inserting ${slice.length} items via RPC...`)
    } else {
      console.log(`💾${label} Retrying insert of ${slice.length} items via RPC (attempt ${attempt + 1}/${config.insertRpcMaxRetries + 1})...`)
    }

    const { data, error } = await getSupabase(config).rpc('fn_bulk_insert_ingredient_history', { p_items: slice })

    if (!error) {
      const insertedCount = Array.isArray(data)
        ? data.length
        : (typeof data === 'number' ? data : (data?.inserted_count ?? 0))
      console.log(`✅${label} Inserted ${insertedCount} rows`)
      return insertedCount
    }

    const isLastAttempt = attempt >= config.insertRpcMaxRetries
    const isTransient = isTransientRpcError(error)
    console.error(`❌${label} RPC error:`, error.message)

    if (isLastAttempt && isTransient && slice.length > 1) {
      const mid = Math.floor(slice.length / 2)
      console.warn(
        `⚠️${label} Transient failure on ${slice.length} items after ${config.insertRpcMaxRetries + 1} attempt(s). ` +
        `Splitting into [${mid}, ${slice.length - mid}]...`
      )
      const [leftCount, rightCount] = await Promise.all([
        insertPayload(slice.slice(0, mid), splitDepth + 1, config),
        insertPayload(slice.slice(mid), splitDepth + 1, config),
      ])
      return leftCount + rightCount
    }

    if (isLastAttempt || !isTransient) {
      throw error
    }

    const baseDelay = config.insertRpcRetryBaseDelayMs * (2 ** attempt)
    const jitterMs = Math.floor(Math.random() * 250)
    const delayMs = Math.min(baseDelay + jitterMs, config.insertRpcRetryMaxDelayMs)
    console.warn(
      `⚠️${label} Transient RPC failure (attempt ${attempt + 1}/${config.insertRpcMaxRetries + 1}). ` +
      `Retrying in ${delayMs}ms...`
    )
    await sleep(delayMs)
  }

  return 0
}

async function bulkInsertIngredientHistory(items, config) {
  if (!items || items.length === 0) {
    console.log('⚠️  No items to insert')
    return 0
  }

  const payload = items
    .map(item => ({
      store: normalizeStoreEnum(item.store),
      price: toPriceNumber(item.price),
      imageUrl: item.imageUrl ?? null,
      productName: (item.productName || '').toString().trim() || null,
      productId: item.productId == null ? null : String(item.productId),
      zipCode: normalizeZipCode(item.zipCode),
      store_id: item.store_id ?? null,
      rawUnit: item.rawUnit ?? item.unit ?? null,
      unit: item.unit ?? null,
    }))
    .filter(item => item.price !== null && item.price >= 0 && item.productName && item.zipCode)

  if (!payload.length) {
    console.warn('⚠️  No valid payload rows after normalization')
    return 0
  }

  if (config.dryRun) {
    console.log(`[DRY RUN] Would insert ${payload.length} items via fn_bulk_insert_ingredient_history`)
    return payload.length
  }

  return insertPayload(payload, 0, config)
}

// ─── Insert queue ─────────────────────────────────────────────────────────────

export class GlobalInsertQueue {
  constructor({ batchSize, maxQueueSize, insertConcurrency, config }) {
    this._queue = []
    this._batchSize = batchSize
    this._maxQueueSize = maxQueueSize
    this._insertConcurrency = insertConcurrency
    this._config = config
    this._totalInserted = 0
    this._drainError = null
    this._activeInserts = 0
    this._backpressureWaiters = []
    this._concurrencyWaiters = []
    this._inFlightKeys = new Set()
    this._totalDeduped = 0
  }

  async push(items) {
    if (this._drainError) throw this._drainError
    const uniqueItems = []

    for (const item of items) {
      const dedupeKey = buildInsertDedupKey(item)
      if (dedupeKey && this._inFlightKeys.has(dedupeKey)) {
        this._totalDeduped += 1
        continue
      }
      if (dedupeKey) {
        this._inFlightKeys.add(dedupeKey)
      }
      uniqueItems.push({ ...item, _dedupeKey: dedupeKey })
    }

    if (uniqueItems.length === 0) return

    if (this._maxQueueSize > 0) {
      while (this._queue.length + uniqueItems.length > this._maxQueueSize) {
        await new Promise(resolve => this._backpressureWaiters.push(resolve))
        if (this._drainError) throw this._drainError
      }
    }
    this._queue.push(...uniqueItems)
    this._maybeFlush()
  }

  async drain() {
    this._maybeFlush()
    // Flush tail (items < batchSize)
    while (this._queue.length > 0 || this._activeInserts > 0) {
      if (this._queue.length > 0 && this._activeInserts < this._insertConcurrency) {
        const batch = this._queue.splice(0, this._queue.length)
        this._runInsert(batch)
      } else {
        await new Promise(resolve => this._concurrencyWaiters.push(resolve))
      }
      if (this._drainError) throw this._drainError
    }
  }

  get totalInserted() { return this._totalInserted }
  get totalDeduped() { return this._totalDeduped }

  _maybeFlush() {
    while (this._queue.length >= this._batchSize && this._activeInserts < this._insertConcurrency) {
      const batch = this._queue.splice(0, this._batchSize)
      this._runInsert(batch)
    }
    this._notifyBackpressureWaiters()
  }

  _runInsert(batch) {
    this._activeInserts += 1
    bulkInsertIngredientHistory(batch, this._config)
      .then(inserted => { this._totalInserted += inserted })
      .catch(err => {
        if (!this._drainError) this._drainError = err
        this._notifyBackpressureWaiters()
        this._notifyConcurrencyWaiters()
      })
      .finally(() => {
        for (const item of batch) {
          if (item?._dedupeKey) this._inFlightKeys.delete(item._dedupeKey)
        }
        this._activeInserts -= 1
        this._notifyConcurrencyWaiters()
        this._maybeFlush()
      })
  }

  _notifyBackpressureWaiters() {
    if (!this._backpressureWaiters.length) return
    if (this._drainError || !this._maxQueueSize || this._queue.length < this._maxQueueSize) {
      // Wake one waiter at a time: the woken producer re-checks the condition,
      // pushes if there's room, then _maybeFlush triggers the next notification.
      // Waking all at once would cause N-1 producers to immediately re-sleep,
      // creating unnecessary promise churn.
      this._backpressureWaiters.shift()()
    }
  }

  _notifyConcurrencyWaiters() {
    if (!this._concurrencyWaiters.length) return
    if (this._drainError || this._activeInserts < this._insertConcurrency) {
      const waiters = this._concurrencyWaiters.splice(0)
      for (const resolve of waiters) resolve()
    }
  }
}
