const axios = require("axios");

const JINA_API_KEY =
  process.env.JINA_API_KEY ||
  process.env.JINA_READER_API_KEY ||
  "";

const JINA_RPM_WITHOUT_KEY = Number(process.env.JINA_RPM_WITHOUT_KEY || 20);
const JINA_RPM_WITH_KEY = Number(process.env.JINA_RPM_WITH_KEY || 200);
const JINA_RPM_OVERRIDE = Number(process.env.JINA_RPM_LIMIT || 0);
const JINA_RESPONSE_CACHE_TTL_MS = Number(
  process.env.JINA_RESPONSE_CACHE_TTL_MS || 120000
);

const jinaInFlight = new Map();
const jinaResponseCache = new Map();

let throttleTail = Promise.resolve();
let nextEligibleAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function hasJinaApiKey() {
  return Boolean(JINA_API_KEY && String(JINA_API_KEY).trim());
}

function getJinaRpmLimit() {
  if (Number.isFinite(JINA_RPM_OVERRIDE) && JINA_RPM_OVERRIDE > 0) {
    return toPositiveInt(JINA_RPM_OVERRIDE, 20);
  }

  return hasJinaApiKey()
    ? toPositiveInt(JINA_RPM_WITH_KEY, 200)
    : toPositiveInt(JINA_RPM_WITHOUT_KEY, 20);
}

function getJinaMinimumIntervalMs() {
  return Math.max(1, Math.ceil(60000 / getJinaRpmLimit()));
}

async function reserveJinaRequestSlot() {
  const prior = throttleTail.catch(() => undefined);
  let release;
  throttleTail = new Promise((resolve) => {
    release = resolve;
  });

  await prior;

  const intervalMs = getJinaMinimumIntervalMs();
  const now = Date.now();
  const waitMs = Math.max(0, nextEligibleAt - now);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const startedAt = Date.now();
  nextEligibleAt = Math.max(nextEligibleAt, startedAt) + intervalMs;
  release();
}

function getCachedEntry(cacheKey) {
  const cached = jinaResponseCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > JINA_RESPONSE_CACHE_TTL_MS) {
    jinaResponseCache.delete(cacheKey);
    return null;
  }
  return cached.response;
}

function buildJinaHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  if (hasJinaApiKey()) {
    headers.Authorization = headers.Authorization || `Bearer ${JINA_API_KEY}`;
  }
  return headers;
}

/**
 * Shared Jina Reader request helper with:
 * 1) Process-wide global rate limiting
 * 2) In-flight dedupe by URL+headers
 * 3) Short-lived response cache
 */
async function fetchJinaReader(url, options = {}) {
  const timeoutMs = toPositiveInt(options.timeoutMs, 30000);
  const customHeaders = options.headers || {};
  const useCache = options.useCache !== false;

  const cacheKey = `${String(url)}::${JSON.stringify(customHeaders)}`;
  if (useCache) {
    const cached = getCachedEntry(cacheKey);
    if (cached) return cached;
  }

  const inFlight = jinaInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = (async () => {
    await reserveJinaRequestSlot();

    const response = await axios.get(url, {
      headers: buildJinaHeaders(customHeaders),
      timeout: timeoutMs,
    });

    if (useCache && response?.data) {
      jinaResponseCache.set(cacheKey, {
        fetchedAt: Date.now(),
        response,
      });
    }

    return response;
  })();

  jinaInFlight.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    jinaInFlight.delete(cacheKey);
  }
}

module.exports = {
  fetchJinaReader,
  getJinaRpmLimit,
  hasJinaApiKey,
};
