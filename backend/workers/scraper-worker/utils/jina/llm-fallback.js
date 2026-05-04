const { withScraperTimeout } = require("../runtime-config");
const {
  requestChatCompletion,
  resolveChatCompletionsUrl,
  resolveLlmApiKey,
  resolveLlmModel,
} = require("../../../../../lib/llm/openai-compatible.js");

const DEFAULT_OPENAI_API_KEY_PLACEHOLDER = "your_openai_api_key_here";

function getOpenAIApiKey() {
  return resolveLlmApiKey() || DEFAULT_OPENAI_API_KEY_PLACEHOLDER;
}

function hasConfiguredOpenAIKey(apiKey = getOpenAIApiKey()) {
  if (!resolveChatCompletionsUrl().includes("api.openai.com")) {
    return true;
  }

  const normalized = String(apiKey || "").trim();
  if (!normalized) return false;
  return !normalized.includes(DEFAULT_OPENAI_API_KEY_PLACEHOLDER);
}

function stripMarkdownCodeFences(text) {
  return String(text || "")
    .trim()
    .replace(/^```json\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function parseJsonFromLlmText(text) {
  const cleaned = stripMarkdownCodeFences(text);
  if (!cleaned) return null;
  return JSON.parse(cleaned);
}

async function requestOpenAIJson({
  prompt,
  systemPrompt = "You are a precise web scraping assistant that returns only valid JSON.",
  openAiApiKey = resolveLlmApiKey(),
  model = resolveLlmModel("gemma3:4b"),
  maxTokens = 2000,
  temperature = 0.1,
  timeoutMs = 20000,
  url = resolveChatCompletionsUrl(),
} = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error("Missing prompt for LLM JSON request");
  }

  const resolvedApiKey = String(openAiApiKey || "").trim()
  const sanitizedApiKey = resolvedApiKey.includes(DEFAULT_OPENAI_API_KEY_PLACEHOLDER) ? "" : resolvedApiKey

  if (url.includes("api.openai.com") && !hasConfiguredOpenAIKey(sanitizedApiKey)) {
    throw new Error("LLM_API_KEY_NOT_CONFIGURED");
  }

  const response = await withScraperTimeout(
    requestChatCompletion({
      url,
      apiKey: sanitizedApiKey,
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: String(prompt),
        },
      ],
      maxTokens,
      temperature,
      timeoutMs,
    }),
    timeoutMs
  );

  const content = response?.choices?.[0]?.message?.content;
  if (!content) return null;
  return parseJsonFromLlmText(content);
}

module.exports = {
  DEFAULT_OPENAI_API_KEY_PLACEHOLDER,
  getOpenAIApiKey,
  hasConfiguredOpenAIKey,
  stripMarkdownCodeFences,
  parseJsonFromLlmText,
  requestOpenAIJson,
};
