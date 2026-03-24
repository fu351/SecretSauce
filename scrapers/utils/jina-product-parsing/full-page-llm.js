function createFullPageJinaLlmParser({
  log,
  storeLabel,
  hasOpenAiKey,
  openAiApiKey,
  requestOpenAIJson,
  requestTimeoutMs,
  buildPrompt,
  normalizeProducts,
  systemPrompt,
  maxTokens = 2000,
  temperature = 0.1,
}) {
  const canUseOpenAi = () =>
    typeof hasOpenAiKey === "function" ? hasOpenAiKey(openAiApiKey) : Boolean(hasOpenAiKey);

  if (typeof buildPrompt !== "function") {
    throw new TypeError("createFullPageJinaLlmParser requires buildPrompt");
  }

  if (typeof normalizeProducts !== "function") {
    throw new TypeError("createFullPageJinaLlmParser requires normalizeProducts");
  }

  return async function parseProductsWithLLM(crawledContent, keyword) {
    try {
      log.debug(`Parsing ${storeLabel} products with LLM for keyword: ${keyword}`);

      if (!canUseOpenAi()) {
        log.warn(`Missing OPENAI_API_KEY, cannot parse ${storeLabel} products with LLM`);
        return [];
      }

      const products = await requestOpenAIJson({
        prompt: buildPrompt(crawledContent, keyword),
        systemPrompt,
        openAiApiKey,
        maxTokens,
        temperature,
        timeoutMs: Math.min(requestTimeoutMs, 20000),
      });

      if (!Array.isArray(products)) {
        log.warn("No content returned from LLM");
        return [];
      }

      return normalizeProducts(products, keyword);
    } catch (error) {
      log.error("Error parsing products with LLM:", error.message);
      if (error?.response?.data) {
        log.error("LLM Error Response:", error.response.data);
      }
      return [];
    }
  };
}

module.exports = {
  createFullPageJinaLlmParser,
};
