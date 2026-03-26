#!/usr/bin/env node
// Legacy compatibility shim. The canonical daily scraper entrypoint now lives
// under workers/daily-scraper-worker/runner.js.
import '../workers/daily-scraper-worker/runner.js'
