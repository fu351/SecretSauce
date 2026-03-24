function createBlockJinaLlmParser({
  log,
  hasOpenAiKey,
  openAiApiKey,
  requestOpenAIJson,
  requestTimeoutMs,
  buildPrompt,
  normalizeProduct,
  systemPrompt = "You extract one product from markdown and return only strict JSON.",
  maxTokens = 700,
  temperature = 0,
}) {
  const canUseOpenAi = () =>
    typeof hasOpenAiKey === "function" ? hasOpenAiKey(openAiApiKey) : Boolean(hasOpenAiKey);

  if (typeof buildPrompt !== "function") {
    throw new TypeError("createBlockJinaLlmParser requires buildPrompt");
  }

  if (typeof normalizeProduct !== "function") {
    throw new TypeError("createBlockJinaLlmParser requires normalizeProduct");
  }

  async function parseSingleBlock(blockContent, keyword) {
    if (!canUseOpenAi()) {
      return null;
    }

    const parsed = await requestOpenAIJson({
      prompt: buildPrompt(blockContent, keyword),
      systemPrompt,
      openAiApiKey,
      maxTokens,
      temperature,
      timeoutMs: Math.min(requestTimeoutMs, 20000),
    });

    if (!parsed || parsed === "null") {
      return null;
    }

    return normalizeProduct(parsed, keyword);
  }

  return async function parseBlocksWithLLM(blocks, keyword, options = {}) {
    if (!Array.isArray(blocks) || blocks.length === 0 || !canUseOpenAi()) {
      return [];
    }

    const requestedLimit = Number(options.limit ?? blocks.length);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), blocks.length)
      : blocks.length;

    const resolved = [];
    for (const blockContent of blocks.slice(0, limit)) {
      try {
        const parsed = await parseSingleBlock(blockContent, keyword);
        if (parsed) {
          resolved.push(parsed);
        }
      } catch (error) {
        log.warn(`[${options.logLabel || "jina"}] LLM block fallback failed: ${error?.message || error}`);
      }
    }

    return resolved;
  };
}

module.exports = {
  createBlockJinaLlmParser,
};
