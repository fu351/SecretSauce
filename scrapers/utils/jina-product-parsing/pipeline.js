async function parseJinaProductsWithFallbacks({
  crawledContent,
  keyword,
  parseWithRegex,
  parseFallbackBlocksWithLLM,
  parseFullPageWithLLM,
  mergeProducts = (regexProducts, fallbackProducts) => [
    ...(Array.isArray(regexProducts) ? regexProducts : []),
    ...(Array.isArray(fallbackProducts) ? fallbackProducts : []),
  ],
}) {
  if (!crawledContent) {
    return [];
  }

  const regexParsed = parseWithRegex(crawledContent, keyword) || {};
  let products = Array.isArray(regexParsed.products) ? regexParsed.products : [];

  const fallbackBlocks = Array.isArray(regexParsed.llmFallbackBlocks)
    ? regexParsed.llmFallbackBlocks
    : [];

  if (fallbackBlocks.length > 0 && typeof parseFallbackBlocksWithLLM === "function") {
    const llmFallbackProducts = await parseFallbackBlocksWithLLM(fallbackBlocks, keyword);
    if (llmFallbackProducts.length > 0) {
      products = mergeProducts(products, llmFallbackProducts, keyword);
    }
  }

  const shouldTryFullPageLlm = regexParsed.shouldTryFullPageLlm !== false;
  if (products.length === 0 && shouldTryFullPageLlm && typeof parseFullPageWithLLM === "function") {
    products = await parseFullPageWithLLM(crawledContent, keyword);
  }

  return Array.isArray(products) ? products : [];
}

module.exports = {
  parseJinaProductsWithFallbacks,
};
