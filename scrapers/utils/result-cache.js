/**
 * Universal in-memory result cache for scrapers.
 *
 * Features:
 *   - TTL-based expiry (ttlMs=0 disables expiry)
 *   - Max-entries size cap (maxEntries=0 disables cap), evicts oldest first
 *   - In-flight dedup: concurrent identical requests share one Promise
 *   - Generic item dedup helpers for scraper-specific result merging
 *   - Normalized cache key builder: `keyword::zipCode`
 *
 * Each call to createResultCache() returns an independent instance with its
 * own Map, so module-level singletons in different scrapers don't share state.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @param {object}  [options]
 * @param {number}  [options.ttlMs=300000]  Entry lifetime in ms. 0 = never expire.
 * @param {number}  [options.maxEntries=0]  Max stored entries. 0 = unlimited.
 */
function createResultCache({ ttlMs = DEFAULT_TTL_MS, maxEntries = 0 } = {}) {
  const store = new Map();    // key -> { fetchedAt: number, results: any }
  const inFlight = new Map(); // key -> Promise

  /** Builds a normalized `keyword::zipCode` key. */
  function buildKey(keyword, zipCode) {
    const k = String(keyword || '').trim().toLowerCase();
    const z = String(zipCode || '').trim();
    return z ? `${k}::${z}` : k;
  }

  /** Returns cached results for key, or null if missing/expired. */
  function get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (ttlMs > 0 && Date.now() - entry.fetchedAt > ttlMs) {
      store.delete(key);
      return null;
    }
    return entry.results;
  }

  /** Stores results under key. Enforces size cap immediately. */
  function set(key, results) {
    store.set(key, { fetchedAt: Date.now(), results });
    _enforceCap();
  }

  /** Removes all entries that have exceeded their TTL. */
  function sweep() {
    if (ttlMs <= 0) return;
    const now = Date.now();
    for (const [k, entry] of store.entries()) {
      if (now - entry.fetchedAt > ttlMs) store.delete(k);
    }
  }

  function _enforceCap() {
    if (!maxEntries || maxEntries <= 0) return;
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  /** Returns the in-flight Promise for key, or undefined. */
  function getInFlight(key) { return inFlight.get(key); }

  /** Registers an in-flight Promise for key. */
  function setInFlight(key, promise) { inFlight.set(key, promise); }

  /** Removes the in-flight entry for key. */
  function deleteInFlight(key) { inFlight.delete(key); }

  /**
   * Creates a lightweight deduper for arrays or incremental result merging.
   *
   * @param {object} options
   * @param {(item:any)=>string|null|undefined} options.getKey
   * @param {(item:any,key:string)=>void} [options.onDuplicate]
   * @param {boolean} [options.keepItemsWithoutKey=true]
   */
  function createDeduper({ getKey, onDuplicate, keepItemsWithoutKey = true } = {}) {
    if (typeof getKey !== 'function') {
      throw new TypeError('createDeduper requires a getKey function');
    }

    const seenKeys = new Set();
    const values = [];

    function add(item) {
      if (!item) return false;

      const rawKey = getKey(item);
      const normalizedKey =
        rawKey === null || rawKey === undefined ? '' : String(rawKey).trim();

      if (!normalizedKey) {
        if (!keepItemsWithoutKey) return false;
        values.push(item);
        return true;
      }

      if (seenKeys.has(normalizedKey)) {
        if (typeof onDuplicate === 'function') {
          onDuplicate(item, normalizedKey);
        }
        return false;
      }

      seenKeys.add(normalizedKey);
      values.push(item);
      return true;
    }

    function addMany(items) {
      if (!Array.isArray(items)) return values;
      for (const item of items) {
        add(item);
      }
      return values;
    }

    function getValues() {
      return values.slice();
    }

    return {
      add,
      addMany,
      values: getValues,
      hasKey: (key) => seenKeys.has(String(key || '').trim()),
      size: () => values.length,
    };
  }

  function dedupe(items, options) {
    const deduper = createDeduper(options);
    deduper.addMany(items);
    return deduper.values();
  }

  async function runCached(key, loadResults, options = {}) {
    const { retryOnInFlightError = false, shouldCache } = options;

    const cached = get(key);
    if (cached !== null) {
      return cached;
    }

    const existingInFlight = getInFlight(key);
    if (existingInFlight) {
      try {
        return await existingInFlight;
      } catch (error) {
        if (!retryOnInFlightError) {
          throw error;
        }
      }
    }

    const promise = (async () => {
      const results = await loadResults();
      const shouldStore = typeof shouldCache === 'function'
        ? shouldCache(results)
        : Array.isArray(results)
          ? results.length > 0
          : Boolean(results);

      if (shouldStore) {
        set(key, results);
      }

      return results;
    })();

    setInFlight(key, promise);
    try {
      return await promise;
    } finally {
      deleteInFlight(key);
    }
  }

  return {
    buildKey,
    get,
    set,
    sweep,
    getInFlight,
    setInFlight,
    deleteInFlight,
    createDeduper,
    dedupe,
    runCached,
  };
}

module.exports = { createResultCache };
