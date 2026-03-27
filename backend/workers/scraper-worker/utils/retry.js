function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterHeaderToMs(retryAfterValue) {
  if (!retryAfterValue) return 0;

  const asNumber = Number(retryAfterValue);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.round(asNumber * 1000);
  }

  const asDateMs = Date.parse(String(retryAfterValue));
  if (Number.isFinite(asDateMs)) {
    return Math.max(0, asDateMs - Date.now());
  }

  return 0;
}

async function withExponentialBackoffRetry(fn, options = {}) {
  const {
    maxRetries = 0,
    baseDelay = 1000,
    maxDelay = 10000,
    timeoutMultiplier = 1.5,
    initialTimeout = 10000,
    onAttempt,
    getRetryDecision,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const currentTimeout = Math.min(
      initialTimeout * Math.pow(timeoutMultiplier, attempt),
      initialTimeout * 3
    );

    try {
      if (onAttempt) {
        await onAttempt({ attempt, maxRetries, currentTimeout });
      }

      return await fn(currentTimeout, attempt);
    } catch (error) {
      lastError = error;

      const defaultDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const decision = getRetryDecision
        ? await getRetryDecision({ error, attempt, maxRetries, currentTimeout, defaultDelay })
        : null;

      const shouldRetry = decision?.shouldRetry ?? attempt < maxRetries;
      const delayMs = decision?.delayMs ?? defaultDelay;
      const breakDelayMs = decision?.breakDelayMs ?? 0;

      if (!shouldRetry || attempt === maxRetries) {
        if (breakDelayMs > 0) {
          await sleep(breakDelayMs);
        }
        break;
      }

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

module.exports = {
  sleep,
  parseRetryAfterHeaderToMs,
  withExponentialBackoffRetry,
};
