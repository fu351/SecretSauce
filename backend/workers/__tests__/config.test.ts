import { afterEach, describe, expect, it } from "vitest"

import { getQueueWorkerConfigFromEnv } from "../config"

describe("getQueueWorkerConfigFromEnv", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("supports separate recipe and scraper contexts when dynamic routing is enabled", () => {
    process.env.QUEUE_STANDARDIZER_CONTEXT = "dynamic"
    process.env.QUEUE_RECIPE_STANDARDIZER_CONTEXT = "pantry"
    process.env.QUEUE_SCRAPER_STANDARDIZER_CONTEXT = "scraper"

    const config = getQueueWorkerConfigFromEnv()

    expect(config.standardizerContext).toBe("dynamic")
    expect(config.recipeStandardizerContext).toBe("pantry")
    expect(config.scraperStandardizerContext).toBe("scraper")
  })

  it("defaults source-specific dynamic contexts to recipe and scraper", () => {
    process.env.QUEUE_STANDARDIZER_CONTEXT = "dynamic"
    delete process.env.QUEUE_RECIPE_STANDARDIZER_CONTEXT
    delete process.env.QUEUE_SCRAPER_STANDARDIZER_CONTEXT

    const config = getQueueWorkerConfigFromEnv()

    expect(config.recipeStandardizerContext).toBe("recipe")
    expect(config.scraperStandardizerContext).toBe("scraper")
  })
})
