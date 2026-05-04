import { afterEach, describe, expect, it } from "vitest"

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe("openai-compatible LLM config", () => {
  it("uses an OpenAI model default for OpenAI endpoints", async () => {
    process.env.LLM_MODEL = ""
    process.env.GEMMA_MODEL = ""
    process.env.OPENAI_MODEL = ""

    const { resolveLlmModelForUrl } = await import("@/lib/llm/openai-compatible.js")

    expect(resolveLlmModelForUrl("https://api.openai.com/v1/chat/completions")).toBe("gpt-4o-mini")
  })

  it("uses the local model default for non-OpenAI compatible endpoints", async () => {
    process.env.LLM_MODEL = ""
    process.env.GEMMA_MODEL = ""
    process.env.OPENAI_MODEL = ""

    const { resolveLlmModelForUrl } = await import("@/lib/llm/openai-compatible.js")

    expect(resolveLlmModelForUrl("http://localhost:11434/v1/chat/completions")).toBe("gemma3:4b")
  })

  it("lets explicit LLM_MODEL override endpoint-aware defaults", async () => {
    process.env.LLM_MODEL = "custom-model"

    const { resolveLlmModelForUrl } = await import("@/lib/llm/openai-compatible.js")

    expect(resolveLlmModelForUrl("https://api.openai.com/v1/chat/completions")).toBe("custom-model")
  })
})
