#!/usr/bin/env tsx

import "dotenv/config"
import * as queueModule from "../queue/index.ts"

const runQueueResolverFromEnv =
  (queueModule as { runQueueResolverFromEnv?: unknown }).runQueueResolverFromEnv ??
  (queueModule as { default?: { runQueueResolverFromEnv?: unknown } }).default?.runQueueResolverFromEnv

if (typeof runQueueResolverFromEnv !== "function") {
  throw new Error("Failed to load runQueueResolverFromEnv from queue module")
}

runQueueResolverFromEnv().catch((error: unknown) => {
  console.error("[QueueResolver] Unhandled error:", error)
  process.exit(1)
})
