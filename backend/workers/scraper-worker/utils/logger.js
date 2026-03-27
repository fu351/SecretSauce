const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isTruthy(value) {
  if (value == null) return false;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

/**
 * Creates a named logger instance.
 * @param {string} [name] - Context label (e.g. 'kroger', 'daily-scraper'). Defaults to 'app'.
 */
function createLogger(name) {
  const resolvedName = String(name || "app")
    .trim()
    .toLowerCase();
  const prefix = `[${resolvedName}]`;
  const envKey = `${resolvedName.replace(/[^a-z0-9]+/g, "_").toUpperCase()}_DEBUG`;
  const isDebugEnabled = isTruthy(process.env.SCRAPER_DEBUG) || isTruthy(process.env[envKey]);

  const normalizeArgs = (args) => {
    if (typeof args[0] === "string" && args[0].startsWith(prefix)) {
      return args;
    }
    return [prefix, ...args];
  };

  return {
    isDebugEnabled,
    debug: (...args) => {
      if (isDebugEnabled) {
        console.log(...normalizeArgs(args));
      }
    },
    info: (...args) => {
      console.log(...normalizeArgs(args));
    },
    warn: (...args) => {
      console.warn(...normalizeArgs(args));
    },
    error: (...args) => {
      console.error(...normalizeArgs(args));
    },
  };
}

/** @deprecated Use createLogger instead */
const createScraperLogger = createLogger;

/** Default universal logger — use when a named context isn't needed. */
const log = createLogger("app");

module.exports = {
  createLogger,
  createScraperLogger,
  log,
};
