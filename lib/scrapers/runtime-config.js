const { AsyncLocalStorage } = require("node:async_hooks");

const runtimeConfigStorage = new AsyncLocalStorage();

const DEFAULT_LIVE_TIMEOUT_MULTIPLIER = Number(
  process.env.SCRAPER_LIVE_TIMEOUT_MULTIPLIER || 3
);
const DEFAULT_LIVE_TIMEOUT_FLOOR_MS = Number(
  process.env.SCRAPER_LIVE_TIMEOUT_FLOOR_MS || 45000
);
const LIVE_BYPASS_TIMEOUTS = process.env.SCRAPER_LIVE_BYPASS_TIMEOUTS === "true";

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function getScraperRuntimeConfig() {
  return runtimeConfigStorage.getStore() || null;
}

function runWithScraperRuntimeConfig(config, fn) {
  return runtimeConfigStorage.run(config || {}, fn);
}

function isLiveActivation() {
  return Boolean(getScraperRuntimeConfig()?.liveActivation);
}

function resolveTimeoutMs(ms) {
  const numericMs = Number(ms);
  if (!Number.isFinite(numericMs) || numericMs <= 0) {
    return numericMs;
  }

  const runtimeConfig = getScraperRuntimeConfig();
  if (!runtimeConfig?.liveActivation) {
    return numericMs;
  }

  if (runtimeConfig.bypassTimeouts === true || LIVE_BYPASS_TIMEOUTS) {
    return null;
  }

  const multiplier = toPositiveNumber(
    runtimeConfig.timeoutMultiplier,
    DEFAULT_LIVE_TIMEOUT_MULTIPLIER
  );
  const floorMs = toPositiveNumber(
    runtimeConfig.timeoutFloorMs,
    DEFAULT_LIVE_TIMEOUT_FLOOR_MS
  );

  return Math.max(Math.round(numericMs * multiplier), floorMs);
}

function withScraperTimeout(promise, ms) {
  const effectiveTimeoutMs = resolveTimeoutMs(ms);

  if (effectiveTimeoutMs === null) {
    return promise;
  }

  if (!Number.isFinite(effectiveTimeoutMs) || effectiveTimeoutMs <= 0) {
    return promise;
  }

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Operation timed out after ${effectiveTimeoutMs}ms`)),
      effectiveTimeoutMs
    )
  );
  return Promise.race([promise, timeout]);
}

module.exports = {
  getScraperRuntimeConfig,
  isLiveActivation,
  resolveTimeoutMs,
  runWithScraperRuntimeConfig,
  withScraperTimeout,
};
