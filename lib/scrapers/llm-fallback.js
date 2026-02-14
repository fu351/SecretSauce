const axios = require("axios");
const { withScraperTimeout } = require("./runtime-config");

const DEFAULT_OPENAI_API_KEY_PLACEHOLDER = "your_openai_api_key_here";

function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY || DEFAULT_OPENAI_API_KEY_PLACEHOLDER;
}

function hasConfiguredOpenAIKey(apiKey = getOpenAIApiKey()) {
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
  openAiApiKey = getOpenAIApiKey(),
  model = "gpt-4o-mini",
  maxTokens = 2000,
  temperature = 0.1,
  timeoutMs = 20000,
} = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error("Missing prompt for OpenAI JSON request");
  }

  if (!hasConfiguredOpenAIKey(openAiApiKey)) {
    throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  }

  const response = await withScraperTimeout(
    axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
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
        max_tokens: maxTokens,
        temperature,
      },
      {
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
      }
    ),
    timeoutMs
  );

  const content = response?.data?.choices?.[0]?.message?.content;
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
