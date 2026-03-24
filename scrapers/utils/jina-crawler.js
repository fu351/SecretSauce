const { fetchJinaReader } = require("./jina-client");
const {
  sleep,
  parseRetryAfterHeaderToMs,
  withExponentialBackoffRetry,
} = require("./retry");

function createJinaRateLimitError(message, code = "JINA_RATE_LIMIT", status = 429) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function createJinaCrawler({
  log,
  withTimeout,
  enforceRateLimit,
  buildSearchUrl,
  headers = {},
  requestTimeoutMs,
  totalTimeoutMs,
  maxRetries,
  baseDelayMs,
  min429RetryDelayMs = 0,
  cooldownMs = 0,
  maxConsecutive429 = 0,
  cooldownSleepCapMs = 0,
  rateLimitErrorPrefix = "JINA",
  requestLabel = "Jina AI",
  describeSearch = (keyword, zipCode) =>
    zipCode ? `${keyword} in ${zipCode}` : `${keyword}`,
  onError,
}) {
  let consecutive429 = 0;
  let cooldownUntilMs = 0;

  function isCooldownActive() {
    return Date.now() < cooldownUntilMs;
  }

  function getCooldownRemainingMs() {
    return Math.max(0, cooldownUntilMs - Date.now());
  }

  async function sleepDuringCooldown(contextLabel) {
    if (!isCooldownActive()) {
      return;
    }

    const sleepMs = Math.max(
      0,
      Math.min(getCooldownRemainingMs(), cooldownSleepCapMs || 0)
    );
    if (sleepMs <= 0) {
      return;
    }

    log.warn(
      `[${requestLabel.toLowerCase()}] ${contextLabel}: cooldown active, sleeping ${sleepMs}ms before continuing`
    );
    await sleep(sleepMs);
  }

  function register429AndMaybeEnterCooldown(suggestedDelayMs = 0) {
    if (maxConsecutive429 <= 0 || cooldownMs <= 0) {
      return false;
    }

    consecutive429 += 1;
    if (consecutive429 < maxConsecutive429) {
      return false;
    }

    cooldownUntilMs = Date.now() + Math.max(cooldownMs, suggestedDelayMs || 0);
    return true;
  }

  function reset429State() {
    consecutive429 = 0;
    if (!isCooldownActive()) {
      cooldownUntilMs = 0;
    }
  }

  function buildRateLimitError(message, codeSuffix = "RATE_LIMIT", status = 429) {
    return createJinaRateLimitError(
      message,
      `${rateLimitErrorPrefix}_${codeSuffix}`,
      status
    );
  }

  function isRateLimitError(error) {
    if (!error) return false;
    const status = error?.status ?? error?.response?.status;
    return status === 429 || String(error?.code || "").startsWith(rateLimitErrorPrefix);
  }

  async function crawl(keyword, zipCode, options = {}) {
    const contextLabel = options.contextLabel || "crawl";
    const searchDescription = describeSearch(keyword, zipCode);

    if (isCooldownActive()) {
      await sleepDuringCooldown(contextLabel);
      throw buildRateLimitError(
        `[${requestLabel.toLowerCase()}] cooldown active for ${getCooldownRemainingMs()}ms`,
        "COOLDOWN",
        429
      );
    }

    const searchUrl = buildSearchUrl(keyword, zipCode);
    const jinaReaderUrl = `https://r.jina.ai/${searchUrl}`;

    try {
      log.debug(`Crawling ${requestLabel} search page for: ${searchDescription}`);

      const requestPromise = withExponentialBackoffRetry(
        async (currentTimeout, attempt) => {
          log.debug(`${requestLabel} request (attempt ${attempt + 1})`);
          await enforceRateLimit();

          const axiosTimeout = Math.floor(currentTimeout * 0.9);
          return await withTimeout(
            fetchJinaReader(jinaReaderUrl, {
              headers,
              timeoutMs: axiosTimeout,
            }),
            currentTimeout
          );
        },
        {
          initialTimeout: requestTimeoutMs,
          maxRetries,
          baseDelay: baseDelayMs,
          onAttempt: ({ attempt, maxRetries: maxRetryCount, currentTimeout }) => {
            log.debug(
              `Attempt ${attempt + 1}/${maxRetryCount + 1} with timeout ${currentTimeout}ms`
            );
          },
          getRetryDecision: ({ error, attempt, maxRetries: maxRetryCount, defaultDelay }) => {
            const status = error?.response?.status ?? error?.status;
            let delay = defaultDelay;

            if (status === 429) {
              const retryAfterMs = parseRetryAfterHeaderToMs(
                error?.response?.headers?.["retry-after"]
              );
              delay = Math.max(defaultDelay, min429RetryDelayMs, retryAfterMs || 0);

              const cooldownEntered = register429AndMaybeEnterCooldown(retryAfterMs || delay);
              log.warn(
                `[${requestLabel.toLowerCase()}] rate limit (429) on attempt ${attempt + 1}/${maxRetryCount + 1}; ` +
                  `retrying in ${delay}ms${cooldownEntered ? " (entering cooldown)" : ""}`
              );

              if (cooldownEntered || attempt === maxRetryCount) {
                return {
                  shouldRetry: false,
                  breakDelayMs: cooldownEntered
                    ? Math.min(delay, cooldownSleepCapMs || 0)
                    : 0,
                };
              }

              log.debug(`Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay}ms...`);
              return { shouldRetry: true, delayMs: delay };
            }

            reset429State();

            if (attempt === maxRetryCount) {
              return { shouldRetry: false };
            }

            log.debug(
              `Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay}ms...`
            );
            return { shouldRetry: true, delayMs: delay };
          },
        }
      );

      const response = totalTimeoutMs
        ? await withTimeout(requestPromise, totalTimeoutMs)
        : await requestPromise;

      if (!response.data) {
        log.warn("No content retrieved from Jina AI API");
        return null;
      }

      log.debug(`Successfully retrieved content from Jina AI (${response.data.length} chars)`);
      reset429State();
      return response.data;
    } catch (error) {
      if (isRateLimitError(error)) {
        const remainingMs = getCooldownRemainingMs();
        log.warn(
          `[${requestLabel.toLowerCase()}] rate-limited for "${keyword}"` +
            `(consecutive_429=${consecutive429}${remainingMs > 0 ? `, cooldown_ms=${remainingMs}` : ""})`
        );

        throw buildRateLimitError(
          `[${requestLabel.toLowerCase()}] 429 for "${keyword}"`,
          isCooldownActive() ? "COOLDOWN" : "429",
          429
        );
      }

      log.error(`Error crawling with Jina AI after all retries: ${error.message}`);
      if (onError) {
        await onError(error, { keyword, zipCode, requestUrl: jinaReaderUrl });
      }
      return null;
    }
  }

  return {
    crawl,
    isCooldownActive,
    getCooldownRemainingMs,
    sleepDuringCooldown,
    reset429State,
    buildRateLimitError,
    isRateLimitError,
  };
}

module.exports = {
  createJinaCrawler,
};
