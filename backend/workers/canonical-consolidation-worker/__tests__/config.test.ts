import { afterEach, describe, expect, it } from "vitest"

import { getCanonicalConsolidationWorkerConfigFromEnv } from "../config"

const originalEnv = { ...process.env }

describe("getCanonicalConsolidationWorkerConfigFromEnv", () => {
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("defaults cluster planning to enabled", () => {
    delete process.env.CONSOLIDATION_ENABLE_CLUSTER_PLANNING

    const config = getCanonicalConsolidationWorkerConfigFromEnv()

    expect(config.enableClusterPlanning).toBe(true)
  })

  it("still allows the env var to disable cluster planning", () => {
    process.env.CONSOLIDATION_ENABLE_CLUSTER_PLANNING = "false"

    const config = getCanonicalConsolidationWorkerConfigFromEnv()

    expect(config.enableClusterPlanning).toBe(false)
  })
})
