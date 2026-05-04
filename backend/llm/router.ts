import {
  requestChatCompletion,
  resolveChatCompletionsUrl,
  resolveLlmApiKey,
  resolveLlmModel,
} from "@/lib/llm/openai-compatible.js"
import { LLM_TASK_DEFAULTS, type LlmTask } from "./tasks"

export interface LlmChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LlmTaskConfig {
  task: LlmTask
  url: string
  apiKey: string
  model: string
  timeoutMs: number
  maxTokens: number
  temperature: number
  responseFormat?: { type: "json_object" }
}

export interface LlmRequestOverrides {
  model?: string
  timeoutMs?: number
  maxTokens?: number
  temperature?: number
  responseFormat?: { type: "json_object" }
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeChatCompletionsUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "")
  if (/\/chat\/completions$/i.test(normalizedBase)) {
    return normalizedBase
  }
  if (/\/v1$/i.test(normalizedBase)) {
    return `${normalizedBase}/chat/completions`
  }
  return `${normalizedBase}/v1/chat/completions`
}

function resolveTaskUrl(envPrefix: string): string {
  const explicit = trim(process.env[`LLM_${envPrefix}_CHAT_COMPLETIONS_URL`])
  if (explicit) return explicit

  const baseUrl = trim(process.env[`LLM_${envPrefix}_BASE_URL`])
  if (baseUrl) return normalizeChatCompletionsUrl(baseUrl)

  return resolveChatCompletionsUrl()
}

function resolveTaskApiKey(envPrefix: string): string {
  return trim(process.env[`LLM_${envPrefix}_API_KEY`]) || resolveLlmApiKey()
}

function isOpenAiEndpoint(url: string): boolean {
  return url.includes("api.openai.com")
}

export function requiresApiKey(config: Pick<LlmTaskConfig, "url">): boolean {
  return isOpenAiEndpoint(config.url)
}

export function resolveLlmTaskConfig(
  task: LlmTask,
  overrides: LlmRequestOverrides = {}
): LlmTaskConfig {
  const defaults = LLM_TASK_DEFAULTS[task]
  const envPrefix = defaults.envPrefix

  return {
    task,
    url: resolveTaskUrl(envPrefix),
    apiKey: resolveTaskApiKey(envPrefix),
    model:
      trim(overrides.model) ||
      trim(process.env[`LLM_${envPrefix}_MODEL`]) ||
      resolveLlmModel(defaults.defaultModel),
    timeoutMs:
      overrides.timeoutMs ??
      readPositiveInt(process.env[`LLM_${envPrefix}_TIMEOUT_MS`], defaults.timeoutMs),
    maxTokens:
      overrides.maxTokens ??
      readPositiveInt(process.env[`LLM_${envPrefix}_MAX_TOKENS`], defaults.maxTokens),
    temperature: overrides.temperature ?? (() => {
      const parsed = Number.parseFloat(process.env[`LLM_${envPrefix}_TEMPERATURE`] || "")
      return Number.isFinite(parsed) ? parsed : defaults.temperature
    })(),
    responseFormat: overrides.responseFormat ?? defaults.responseFormat,
  }
}

export async function requestLlmChatCompletion(params: {
  task: LlmTask
  messages: LlmChatMessage[]
  overrides?: LlmRequestOverrides
}): Promise<{ content: string | null; config: LlmTaskConfig }> {
  const config = resolveLlmTaskConfig(params.task, params.overrides)

  if (isOpenAiEndpoint(config.url) && !config.apiKey) {
    console.warn(`[LLMRouter] ${params.task}: missing API key for OpenAI endpoint`)
    return { content: null, config }
  }

  const startedAt = Date.now()
  try {
    const response = await requestChatCompletion({
      url: config.url,
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      responseFormat: config.responseFormat,
      timeoutMs: config.timeoutMs,
      messages: params.messages,
    })

    const durationMs = Date.now() - startedAt
    console.log(
      `[LLMRouter] ${params.task}: completed model=${config.model} durationMs=${durationMs}`
    )

    return {
      content: response?.choices?.[0]?.message?.content?.trim() ?? null,
      config,
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    console.error(
      `[LLMRouter] ${params.task}: failed model=${config.model} durationMs=${durationMs}`,
      error
    )
    throw error
  }
}

export function stripMarkdownCodeFences(text: string): string {
  return String(text || "")
    .trim()
    .replace(/^```json\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim()
}

export function extractJsonFromLlmText(
  content: string,
  preferredShape: "array" | "object" = "array"
): string | null {
  const cleaned = stripMarkdownCodeFences(content)
  if (!cleaned) return null

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)

  if (preferredShape === "object") {
    return objectMatch?.[0] ?? arrayMatch?.[0] ?? cleaned
  }

  return arrayMatch?.[0] ?? objectMatch?.[0] ?? cleaned
}
