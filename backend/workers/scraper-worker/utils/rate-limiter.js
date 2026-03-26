/**
 * Universal rate limiter factory for scrapers.
 *
 * Each call to createRateLimiter returns an independent instance with its own
 * state, so scrapers don't share rate limit windows.
 *
 * Two mechanisms are applied before every request:
 *   1. Window-based cap   — at most `requestsPerSecond` requests per 1-second window.
 *   2. Minimum interval   — at least `minIntervalMs` between consecutive requests,
 *                           optionally with ±20% jitter to appear more human-like.
 *
 * Usage:
 *   const { createRateLimiter } = require('../utils/rate-limiter');
 *   const { enforceRateLimit } = createRateLimiter({
 *     requestsPerSecond: 2,
 *     minIntervalMs: 500,
 *     enableJitter: true,
 *     log,
 *     label: '[mystore]',
 *   });
 *
 *   // Call before every outgoing HTTP request:
 *   await enforceRateLimit();
 *   const response = await axios.get(...);
 */
function createRateLimiter(options = {}) {
    const {
        requestsPerSecond = 2,
        minIntervalMs = 500,
        enableJitter = true,
        log = null,
        label = '[scraper]',
    } = options;

    const state = {
        lastRequestTime: 0,
        requestCount: 0,
        windowStart: Date.now(),
        windowDuration: 1000, // 1-second rolling window
    };

    async function enforceRateLimit() {
        const now = Date.now();

        // Reset the window if 1 second has elapsed since it started
        if (now - state.windowStart >= state.windowDuration) {
            state.windowStart = now;
            state.requestCount = 0;
        }

        // If we've hit the per-second cap, wait out the remainder of the window
        if (state.requestCount >= requestsPerSecond) {
            const waitTime = state.windowDuration - (now - state.windowStart);
            if (waitTime > 0) {
                if (log) {
                    log.debug(`${label} Rate limit: ${state.requestCount} req/window, waiting ${waitTime}ms`);
                }
                await new Promise(resolve => setTimeout(resolve, waitTime));
                state.windowStart = Date.now();
                state.requestCount = 0;
            }
        }

        // Enforce minimum interval between consecutive requests
        const elapsed = Date.now() - state.lastRequestTime;
        if (elapsed < minIntervalMs) {
            const base = minIntervalMs - elapsed;
            const wait = enableJitter ? base * (0.8 + Math.random() * 0.4) : base;
            if (log) {
                log.debug(`${label} Rate limit: enforcing ${Math.round(wait)}ms delay between requests`);
            }
            await new Promise(resolve => setTimeout(resolve, wait));
        }

        state.lastRequestTime = Date.now();
        state.requestCount++;
    }

    return { enforceRateLimit };
}

module.exports = { createRateLimiter };
