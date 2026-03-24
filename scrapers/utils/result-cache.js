/**
 * Universal in-memory result cache for scrapers.
 *
 * Features:
 *   - TTL-based expiry (ttlMs=0 disables expiry)
 *   - Max-entries size cap (maxEntries=0 disables cap), evicts oldest first
 *   - In-flight dedup: concurrent identical requests share one Promise
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

  return { buildKey, get, set, sweep, getInFlight, setInFlight, deleteInFlight };
}

module.exports = { createResultCache };
