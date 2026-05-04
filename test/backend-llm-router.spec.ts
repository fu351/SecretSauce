import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requestChatCompletion: vi.fn(),
  resolveChatCompletionsUrl: vi.fn(),
  resolveLlmApiKey: vi.fn(),
  resolveLlmModel: vi.fn(),
}))

vi.mock("@/lib/llm/openai-compatible.js", () => ({
  requestChatCompletion: mocks.requestChatCompletion,
  resolveChatCompletionsUrl: mocks.resolveChatCompletionsUrl,
  resolveLlmApiKey: mocks.resolveLlmApiKey,
  resolveLlmModel: mocks.resolveLlmModel,
}))

import {
  extractJsonFromLlmText,
  requestLlmChatCompletion,
  resolveLlmTaskConfig,
} from "@/backend/llm/index"

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.clearAllMocks()
})

describe("backend llm router", () => {
  it("resolves task-specific model, base URL, timeout, and token overrides", () => {
    process.env.LLM_INGREDIENT_STANDARDIZE_BASE_URL = "http://localhost:11434"
    process.env.LLM_INGREDIENT_STANDARDIZE_MODEL = "llama3.1:8b"
    process.env.LLM_INGREDIENT_STANDARDIZE_TIMEOUT_MS = "12345"
    process.env.LLM_INGREDIENT_STANDARDIZE_MAX_TOKENS = "777"
    mocks.resolveLlmApiKey.mockReturnValue("")
    mocks.resolveLlmModel.mockImplementation((fallback: string) => fallback)

    const config = resolveLlmTaskConfig("ingredient.standardize")

    expect(config).toMatchObject({
      task: "ingredient.standardize",
      url: "http://localhost:11434/v1/chat/completions",
      model: "llama3.1:8b",
      timeoutMs: 12345,
      maxTokens: 777,
      temperature: 0,
    })
  })

  it("short-circuits OpenAI requests when no API key is configured", async () => {
    mocks.resolveChatCompletionsUrl.mockReturnValue("https://api.openai.com/v1/chat/completions")
    mocks.resolveLlmApiKey.mockReturnValue("")
    mocks.resolveLlmModel.mockImplementation((fallback: string) => fallback)

    const result = await requestLlmChatCompletion({
      task: "unit.standardize",
      messages: [{ role: "user", content: "hello" }],
    })

    expect(result.content).toBeNull()
    expect(mocks.requestChatCompletion).not.toHaveBeenCalled()
  })

  it("extracts fenced JSON with preferred object or array shapes", () => {
    expect(extractJsonFromLlmText('```json\n{"ok":true}\n```', "object")).toBe('{"ok":true}')
    expect(extractJsonFromLlmText('prefix [{"ok":true}] suffix', "array")).toBe('[{"ok":true}]')
  })
})
