import { afterEach, describe, expect, it } from "vitest"

import { getShadowProvider } from "../provider-router"

describe("getShadowProvider", () => {
  afterEach(() => {
    delete process.env.STANDARDIZER_PROVIDER
    delete process.env.STANDARDIZER_SHADOW_PROVIDER
  })

  it("returns null when shadow provider is unset", () => {
    delete process.env.STANDARDIZER_SHADOW_PROVIDER

    expect(getShadowProvider()).toBeNull()
  })

  it("returns ollama for the initial OpenAI-primary shadow rollout", () => {
    process.env.STANDARDIZER_PROVIDER = "openai"
    process.env.STANDARDIZER_SHADOW_PROVIDER = "ollama"

    expect(getShadowProvider()?.name).toBe("ollama")
  })

  it("returns openai when Ollama is primary after promotion", () => {
    process.env.STANDARDIZER_PROVIDER = "ollama"
    process.env.STANDARDIZER_SHADOW_PROVIDER = "openai"

    expect(getShadowProvider()?.name).toBe("openai")
  })

  it("does not shadow with the same active provider", () => {
    process.env.STANDARDIZER_PROVIDER = "openai"
    process.env.STANDARDIZER_SHADOW_PROVIDER = "openai"

    expect(getShadowProvider()).toBeNull()
  })
})
