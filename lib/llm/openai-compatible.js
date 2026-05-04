const axios = require("axios")

function trim(value) {
  return typeof value === "string" ? value.trim() : ""
}

function resolveChatCompletionsUrl() {
  const explicit = trim(process.env.LLM_CHAT_COMPLETIONS_URL)
  if (explicit) return explicit

  const baseUrl = trim(process.env.LLM_BASE_URL) || trim(process.env.OPENAI_BASE_URL)
  if (!baseUrl) {
    return "https://api.openai.com/v1/chat/completions"
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "")
  if (/\/chat\/completions$/i.test(normalizedBase)) {
    return normalizedBase
  }

  if (/\/v1$/i.test(normalizedBase)) {
    return `${normalizedBase}/chat/completions`
  }

  return `${normalizedBase}/v1/chat/completions`
}

function resolveLlmModel(defaultModel = "gemma3:4b") {
  return (
    trim(process.env.LLM_MODEL) ||
    trim(process.env.GEMMA_MODEL) ||
    trim(process.env.OPENAI_MODEL) ||
    defaultModel
  )
}

function resolveLlmApiKey() {
  return (
    trim(process.env.LLM_API_KEY) ||
    trim(process.env.GEMMA_API_KEY) ||
    trim(process.env.OPENAI_API_KEY) ||
    ""
  )
}

function buildLlmHeaders(apiKey, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

async function requestChatCompletion({
  messages,
  model,
  temperature = 0,
  maxTokens,
  responseFormat,
  apiKey,
  url,
  timeoutMs = 30000,
  extraBody = {},
  extraHeaders = {},
} = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Missing messages for chat completion request")
  }

  const resolvedUrl = url || resolveChatCompletionsUrl()
  const resolvedModel = model || resolveLlmModel()
  const resolvedApiKey = typeof apiKey === "string" ? apiKey.trim() : resolveLlmApiKey()

  const body = {
    model: resolvedModel,
    temperature,
    messages,
    ...extraBody,
  }

  if (typeof maxTokens === "number") {
    body.max_tokens = maxTokens
  }

  if (responseFormat) {
    body.response_format = responseFormat
  }

  const response = await axios.post(resolvedUrl, body, {
    headers: buildLlmHeaders(resolvedApiKey, extraHeaders),
    timeout: timeoutMs,
  })

  return response.data
}

module.exports = {
  buildLlmHeaders,
  resolveChatCompletionsUrl,
  resolveLlmApiKey,
  resolveLlmModel,
  requestChatCompletion,
}
