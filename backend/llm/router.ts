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

export interface LlmUsageMetadata {
  requestId?: string
  route?: string
  userId?: string
  inputCount?: number
  fallbackUsed?: boolean
  [key: string]: string | number | boolean | null | undefined
}

export interface LlmUsageEvent {
  event: "llm.request.completed" | "llm.request.failed" | "llm.request.skipped"
  task: LlmTask
  provider: "openai" | "openai-compatible"
  model: string
  status: "success" | "failed" | "skipped"
  durationMs: number
  inputChars: number
  outputChars?: number
  messageCount: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  errorType?: string
  errorMessage?: string
  skipReason?: string
  metadata?: LlmUsageMetadata
}

interface ChatCompletionUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
  usage?: ChatCompletionUsage
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

function resolveProvider(url: string): LlmUsageEvent["provider"] {
  return isOpenAiEndpoint(url) ? "openai" : "openai-compatible"
}

function countMessageChars(messages: LlmChatMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0)
}

function coerceTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
}

function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    if (error.name) return error.name
    return error.constructor.name
  }
  return typeof error
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function buildUsageTokenFields(usage: ChatCompletionUsage | undefined): Pick<
  LlmUsageEvent,
  "promptTokens" | "completionTokens" | "totalTokens"
> {
  return {
    promptTokens: coerceTokenCount(usage?.prompt_tokens),
    completionTokens: coerceTokenCount(usage?.completion_tokens),
    totalTokens: coerceTokenCount(usage?.total_tokens),
  }
}

export function logLlmUsageEvent(event: LlmUsageEvent): void {
  console.info(JSON.stringify(event))
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
  metadata?: LlmUsageMetadata
}): Promise<{ content: string | null; config: LlmTaskConfig }> {
  const config = resolveLlmTaskConfig(params.task, params.overrides)
  const startedAt = Date.now()
  const inputChars = countMessageChars(params.messages)
  const provider = resolveProvider(config.url)

  if (isOpenAiEndpoint(config.url) && !config.apiKey) {
    logLlmUsageEvent({
      event: "llm.request.skipped",
      task: params.task,
      provider,
      model: config.model,
      status: "skipped",
      durationMs: Date.now() - startedAt,
      inputChars,
      messageCount: params.messages.length,
      skipReason: "missing_api_key",
      metadata: params.metadata,
    })
    return { content: null, config }
  }

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
    }) as ChatCompletionResponse

    const durationMs = Date.now() - startedAt
    const content = response?.choices?.[0]?.message?.content?.trim() ?? null

    logLlmUsageEvent({
      event: "llm.request.completed",
      task: params.task,
      provider,
      model: config.model,
      status: "success",
      durationMs,
      inputChars,
      outputChars: content?.length ?? 0,
      messageCount: params.messages.length,
      ...buildUsageTokenFields(response?.usage),
      metadata: params.metadata,
    })

    return {
      content,
      config,
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    logLlmUsageEvent({
      event: "llm.request.failed",
      task: params.task,
      provider,
      model: config.model,
      status: "failed",
      durationMs,
      inputChars,
      messageCount: params.messages.length,
      errorType: getErrorType(error),
      errorMessage: getErrorMessage(error).slice(0, 300),
      metadata: params.metadata,
    })
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
