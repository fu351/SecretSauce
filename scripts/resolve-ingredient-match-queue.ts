#!/usr/bin/env tsx

import { runQueueResolverFromEnv } from "../queue"

runQueueResolverFromEnv().catch((error) => {
  console.error("[QueueResolver] Unhandled error:", error)
  process.exit(1)
})
