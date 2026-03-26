const {
  getScraperRuntimeConfig,
  isLiveActivation,
  resolveTimeoutMs,
  runWithScraperRuntimeConfig,
  withScraperTimeout,
} = require('./utils/runtime-config');

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toPositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function getUniversalScraperControlsFromEnv() {
  return {
    liveActivation: toBoolean(process.env.SCRAPER_WORKER_LIVE_ACTIVATION, false),
    bypassTimeouts: toBoolean(process.env.SCRAPER_WORKER_BYPASS_TIMEOUTS, false),
    timeoutMultiplier: toPositiveNumber(
      process.env.SCRAPER_WORKER_TIMEOUT_MULTIPLIER,
      toPositiveNumber(process.env.SCRAPER_LIVE_TIMEOUT_MULTIPLIER, 3)
    ),
    timeoutFloorMs: toPositiveNumber(
      process.env.SCRAPER_WORKER_TIMEOUT_FLOOR_MS,
      toPositiveNumber(process.env.SCRAPER_LIVE_TIMEOUT_FLOOR_MS, 45000)
    ),
  };
}

function mergeUniversalScraperControls(overrides) {
  return {
    ...getUniversalScraperControlsFromEnv(),
    ...(overrides || {}),
  };
}

function runWithUniversalScraperControls(overrides, fn) {
  const merged = mergeUniversalScraperControls(overrides);
  return runWithScraperRuntimeConfig(merged, fn);
}

module.exports = {
  getScraperRuntimeConfig,
  isLiveActivation,
  resolveTimeoutMs,
  runWithScraperRuntimeConfig,
  withScraperTimeout,
  getUniversalScraperControlsFromEnv,
  mergeUniversalScraperControls,
  runWithUniversalScraperControls,
};
