import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

beforeEach(() => {
  process.env.SUPABASE_URL = ""
  process.env.NEXT_PUBLIC_SUPABASE_URL = ""
  process.env.SUPABASE_SERVICE_ROLE_KEY = ""
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.clearAllMocks()
  vi.restoreAllMocks()
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
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined)
    mocks.resolveChatCompletionsUrl.mockReturnValue("https://api.openai.com/v1/chat/completions")
    mocks.resolveLlmApiKey.mockReturnValue("")
    mocks.resolveLlmModel.mockImplementation((fallback: string) => fallback)

    const result = await requestLlmChatCompletion({
      task: "unit.standardize",
      messages: [{ role: "user", content: "hello" }],
    })

    expect(result.content).toBeNull()
    expect(mocks.requestChatCompletion).not.toHaveBeenCalled()
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(infoSpy.mock.calls[0][0])).toMatchObject({
      event: "llm.request.skipped",
      task: "unit.standardize",
      provider: "openai",
      status: "skipped",
      skipReason: "missing_api_key",
      inputChars: 5,
      messageCount: 1,
    })
  })

  it("extracts fenced JSON with preferred object or array shapes", () => {
    expect(extractJsonFromLlmText('```json\n{"ok":true}\n```', "object")).toBe('{"ok":true}')
    expect(extractJsonFromLlmText('prefix [{"ok":true}] suffix', "array")).toBe('[{"ok":true}]')
  })

  it("logs structured completion analytics without raw prompt content", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined)
    process.env.LLM_UNIT_STANDARDIZE_BASE_URL = "http://localhost:11434"
    mocks.resolveLlmApiKey.mockReturnValue("")
    mocks.resolveLlmModel.mockImplementation((fallback: string) => fallback)
    mocks.requestChatCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 3,
        total_tokens: 14,
      },
    })

    const result = await requestLlmChatCompletion({
      task: "unit.standardize",
      messages: [{ role: "user", content: "secret recipe prompt" }],
      metadata: {
        requestId: "req_123",
        route: "/api/ingredients/standardize",
        inputCount: 2,
      },
    })

    expect(result.content).toBe('{"ok":true}')
    expect(infoSpy).toHaveBeenCalledTimes(1)

    const event = JSON.parse(infoSpy.mock.calls[0][0])
    expect(event).toMatchObject({
      event: "llm.request.completed",
      task: "unit.standardize",
      provider: "openai-compatible",
      model: "gemma3:4b",
      status: "success",
      inputChars: "secret recipe prompt".length,
      outputChars: '{"ok":true}'.length,
      messageCount: 1,
      promptTokens: 11,
      completionTokens: 3,
      totalTokens: 14,
      metadata: {
        requestId: "req_123",
        route: "/api/ingredients/standardize",
        inputCount: 2,
      },
    })
    expect(infoSpy.mock.calls[0][0]).not.toContain("secret recipe prompt")
  })

  it("logs structured failure analytics before rethrowing", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined)
    process.env.LLM_UNIT_STANDARDIZE_BASE_URL = "http://localhost:11434"
    mocks.resolveLlmApiKey.mockReturnValue("")
    mocks.resolveLlmModel.mockImplementation((fallback: string) => fallback)
    mocks.requestChatCompletion.mockRejectedValue(new Error("provider timeout with details"))

    await expect(
      requestLlmChatCompletion({
        task: "unit.standardize",
        messages: [{ role: "user", content: "hello" }],
        metadata: { requestId: "req_fail" },
      })
    ).rejects.toThrow("provider timeout with details")

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(infoSpy.mock.calls[0][0])).toMatchObject({
      event: "llm.request.failed",
      task: "unit.standardize",
      provider: "openai-compatible",
      status: "failed",
      inputChars: 5,
      messageCount: 1,
      errorType: "Error",
      errorMessage: "provider timeout with details",
      metadata: { requestId: "req_fail" },
    })
  })
})
