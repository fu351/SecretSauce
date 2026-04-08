import { afterEach, describe, expect, it } from "vitest"

import { getCanonicalMedoidWorkerConfigFromEnv } from "../config"

const originalEnv = { ...process.env }

describe("getCanonicalMedoidWorkerConfigFromEnv", () => {
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("defaults to perturbation mode for recurring monthly runs", () => {
    delete process.env.CANONICAL_MEDOID_MODE

    const config = getCanonicalMedoidWorkerConfigFromEnv()

    expect(config.mode).toBe("perturbation")
  })

  it("accepts the legacy pertubation spelling", () => {
    process.env.CANONICAL_MEDOID_MODE = "pertubation"

    const config = getCanonicalMedoidWorkerConfigFromEnv()

    expect(config.mode).toBe("perturbation")
  })

  it("supports explicit initiation mode", () => {
    process.env.CANONICAL_MEDOID_MODE = "initiation"

    const config = getCanonicalMedoidWorkerConfigFromEnv()

    expect(config.mode).toBe("initiation")
  })
})
