const path = require('path');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { getOpenAIApiKey, hasConfiguredOpenAIKey, requestOpenAIJson } = require('../utils/jina/llm-fallback');
const { createRateLimiter } = require('../utils/rate-limiter');
const { logHttpErrorToDatabase } = require('../utils/db-error-logger');
const { createResultCache } = require('../utils/result-cache');
const { createJinaCrawler } = require('../utils/jina/crawler');
const {
    createFullPageJinaLlmParser,
    parseJinaProductsWithFallbacks,
} = require('../utils/jina/product-parsing');

const resultCache = createResultCache({ ttlMs: Number(process.env.ALDI_CACHE_TTL_MS || 5 * 60 * 1000) });
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const log = createScraperLogger('aldi');

const { enforceRateLimit } = createRateLimiter({
    requestsPerSecond: Number(process.env.ALDI_REQUESTS_PER_SECOND || 1),
    minIntervalMs: Number(process.env.ALDI_MIN_REQUEST_INTERVAL_MS || 1500),
    enableJitter: process.env.ALDI_ENABLE_JITTER !== 'false',
    log,
    label: '[aldi]',
});

// Utility function to handle timeouts
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

// Environment variables for API keys
const OPENAI_API_KEY = getOpenAIApiKey();
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 25000);
const JINA_TIMEOUT_MS = Number(process.env.JINA_TIMEOUT_MS || 30000);
const JINA_MAX_RETRIES = Number(process.env.JINA_MAX_RETRIES || 2);
const JINA_RETRY_DELAY_MS = Number(process.env.JINA_RETRY_DELAY_MS || 1000);
const JINA_MIN_RETRY_DELAY_MS = Number(process.env.JINA_MIN_429_RETRY_DELAY_MS || 5000);
const JINA_429_COOLDOWN_MS = Number(process.env.JINA_429_COOLDOWN_MS || 90000);
const JINA_MAX_CONSECUTIVE_429 = Number(process.env.JINA_MAX_CONSECUTIVE_429 || 5);
const JINA_COOLDOWN_SLEEP_CAP_MS = Number(process.env.JINA_COOLDOWN_SLEEP_CAP_MS || 10000);
const ALDI_JINA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};

const jinaCrawler = createJinaCrawler({
    log,
    withTimeout,
    enforceRateLimit,
    buildSearchUrl: (keyword) => `https://aldi.us/results?q=${encodeURIComponent(keyword)}`,
    headers: ALDI_JINA_HEADERS,
    requestTimeoutMs: JINA_TIMEOUT_MS,
    maxRetries: JINA_MAX_RETRIES,
    baseDelayMs: JINA_RETRY_DELAY_MS,
    min429RetryDelayMs: JINA_MIN_RETRY_DELAY_MS,
    cooldownMs: JINA_429_COOLDOWN_MS,
    maxConsecutive429: JINA_MAX_CONSECUTIVE_429,
    cooldownSleepCapMs: JINA_COOLDOWN_SLEEP_CAP_MS,
    cooldownScope: "jina-global",
    requestLabel: 'Jina AI',
    describeSearch: (keyword, zipCode) => `${keyword} in ${zipCode}`,
    onError: async (error, { keyword, zipCode, requestUrl }) => {
        if (error.response?.status) {
            await logHttpErrorToDatabase({
                storeEnum: 'aldi',
                zipCode,
                ingredientName: keyword,
                httpStatus: error.response.status,
                requestUrl,
                errorMessage: error.message
            });
        }
    },
});

// Function to crawl Aldi search page using Jina AI Reader API
async function crawlAldiWithJina(keyword, zipCode) {
    return jinaCrawler.crawl(keyword, zipCode);
}

// Function to parse products from Jina markdown using regex (runs before LLM fallback)
// Aldi's Jina markdown typically has product cards with a linked name, price, and image.
// Handles multiple common patterns Jina produces from Aldi's search results page.
function parseProductsWithRegex(crawledContent, keyword) {
    const content = String(crawledContent || "");
    if (!content) {
        return { products: [], shouldTryFullPageLlm: true };
    }

    const dedupedProducts = resultCache.createDeduper({
        getKey: (product) => `${String(product?.title || "").trim().toLowerCase()}::${Number(product?.price).toFixed(2)}`
    });

    // Pattern: ### [Product Name](url) ... $X.XX ... ![img](url)
    // or      ## [Product Name](url) ... $X.XX
    // Aldi Jina markdown uses heading + link blocks for each product card.
    // We capture a window of lines after each heading-link and look for a price.
    const headingLinkRegex = /#{1,4}\s+\[([^\]]{3,120})\]\((https?:\/\/[^\s)]+)\)/gi;

    let match;
    while ((match = headingLinkRegex.exec(content)) !== null) {
        const productName = toOptionalString(match[1]);
        if (!productName) continue;

        // Search the next ~400 chars for a price
        const windowEnd = Math.min(content.length, match.index + match[0].length + 400);
        const window = content.slice(match.index, windowEnd);

        const priceMatch = window.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
        const price = toPriceNumber(priceMatch?.[1]);
        if (!price || price <= 0) continue;

        // Look for an image URL in the same window
        const imgMatch = window.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
        const imageUrl = imgMatch ? imgMatch[1] : "/placeholder.svg";

        dedupedProducts.add({
            id: `aldi-${Math.random().toString(36).substring(7)}`,
            title: productName,
            brand: "ALDI",
            price,
            pricePerUnit: "",
            unit: "",
            rawUnit: "",
            image_url: imageUrl,
            provider: "Aldi",
            location: "Aldi Grocery",
            category: "Grocery"
        });
    }

    // Secondary pattern: plain price line near a bold/plain product name
    // Catches cards where Jina didn't produce a heading+link (e.g. text-only cards)
    if (dedupedProducts.size() === 0) {
        const priceLineRegex = /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/\s*([^\n]{1,30}))?\s*\n/g;
        let priceMatch2;
        while ((priceMatch2 = priceLineRegex.exec(content)) !== null) {
            const price = toPriceNumber(priceMatch2[1]);
            if (!price || price <= 0) continue;

            // Look backwards up to 200 chars for a product name (non-empty line)
            const before = content.slice(Math.max(0, priceMatch2.index - 200), priceMatch2.index);
            const nameLines = before.split("\n").map(l => l.replace(/[#*_[\]()]/g, "").trim()).filter(Boolean);
            const productName = toOptionalString(nameLines[nameLines.length - 1]);
            if (!productName || productName.length < 4) continue;

            const windowEnd = Math.min(content.length, priceMatch2.index + 400);
            const window = content.slice(priceMatch2.index, windowEnd);
            const imgMatch = window.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);

            dedupedProducts.add({
                id: `aldi-${Math.random().toString(36).substring(7)}`,
                title: productName,
                brand: "ALDI",
                price,
                pricePerUnit: priceMatch2[2] ? `$${price}/${priceMatch2[2].trim()}` : "",
                unit: priceMatch2[2] ? priceMatch2[2].trim() : "",
                rawUnit: priceMatch2[2] ? priceMatch2[2].trim() : "",
                image_url: imgMatch ? imgMatch[1] : "/placeholder.svg",
                provider: "Aldi",
                location: "Aldi Grocery",
                category: "Grocery"
            });

            if (dedupedProducts.size() >= 5) break;
        }
    }

    return {
        products: dedupedProducts.values(),
        shouldTryFullPageLlm: dedupedProducts.size() === 0,
    };
}

const parseProductsWithLLM = createFullPageJinaLlmParser({
    log,
    storeLabel: "Aldi",
    hasOpenAiKey: hasConfiguredOpenAIKey,
    openAiApiKey: OPENAI_API_KEY,
    requestOpenAIJson,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    buildPrompt: (crawledContent, keyword) => `
You are a web scraping assistant. Extract the top 5 grocery/food products and their prices from this Aldi search page content.

Search keyword: "${keyword}"

Instructions:
1. Find products that match or are related to "${keyword}"
2. Extract exactly 5 products (or fewer if less available)
3. For each product, extract: title, brand, price, and image URL.
4. The image URL will be in markdown format, like \`![alt text](image_url)\`. Extract the URL.
5. Focus on grocery/food items only.
6. Return ONLY valid JSON in this exact format:

[
  {
    "title": "Product Name Here",
    "brand": "Brand Name (e.g., Simply Nature)",
    "price": 4.99,
    "image_url": "https://example.com/image.jpg",
    "id": "unique-identifier"
  }
]

Aldi page content:
${String(crawledContent || "").substring(0, 30000)}

Return only the JSON array, no other text.`,
    normalizeProducts: (products) =>
        products
            .filter(product => product.title && product.price && product.price > 0)
            .map(product => ({
                id: product.id || `aldi-${Math.random().toString(36).substring(7)}`,
                title: product.title,
                brand: product.brand || "ALDI",
                price: parseFloat(product.price),
                pricePerUnit: "",
                unit: "",
                rawUnit: "",
                image_url: product.image_url || "/placeholder.svg",
                provider: "Aldi",
                location: "Aldi Grocery",
                category: "Grocery"
            })),
});

// Main Aldi search function
async function searchAldi(keyword, zipCode) {
    const cacheKey = resultCache.buildKey(keyword, zipCode);
    return resultCache.runCached(cacheKey, async () => {
    try {
        // Step 1: Crawl Aldi page
        const crawledContent = await crawlAldiWithJina(keyword, zipCode);

        if (!crawledContent) {
            log.debug("Failed to crawl Aldi page, real-time prices unavailable");
            return [];
        }

        // Step 2: Try regex extraction first (fast, free, no API call)
        const regexPreview = parseProductsWithRegex(crawledContent, keyword);
        if (regexPreview.products.length > 0) {
            log.debug(`Regex extracted ${regexPreview.products.length} products from Aldi`);
        } else if (regexPreview.shouldTryFullPageLlm) {
            log.debug("Regex found no products, falling back to LLM");
        }

        // Step 3: Regex found nothing — fall back to LLM
        const products = await parseJinaProductsWithFallbacks({
            crawledContent,
            keyword,
            parseWithRegex: parseProductsWithRegex,
            parseFullPageWithLLM: parseProductsWithLLM,
        });

        if (products.length === 0) {
            log.debug(regexPreview.shouldTryFullPageLlm
                ? "LLM failed to extract products, real-time prices unavailable"
                : "No products found from Aldi");
            return [];
        }

        if (regexPreview.products.length === 0) {
            log.debug(`LLM extracted ${products.length} products from Aldi`);
        }

        return products;

    } catch (error) {
        log.error("Error in Aldi search:", error.message, "- real-time prices unavailable");
        return [];
    }
    });
}

// Main function to execute the script
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        log.error("Usage: node aldi.js <keyword> <zipCode>");
        log.error("Note: You need OPENAI_API_KEY environment variable");
        process.exit(1);
    }

    if (OPENAI_API_KEY === "your_openai_api_key_here") {
        log.warn("⚠️  Missing OPENAI_API_KEY - using mock data");
        log.warn("Set OPENAI_API_KEY environment variable for real data");
        console.log(JSON.stringify([], null, 2));
        return;
    }

    try {
        log.debug(`🔍 Searching Aldi for "${keyword}" in zip ${zipCode} using Jina AI + LLM approach...`);

        const results = await searchAldi(keyword, zipCode);

        if (results.length === 0) {
            log.debug("No results from Jina/LLM approach, real-time prices unavailable");
        }

        console.log(JSON.stringify(results, null, 2));

    } catch (err) {
        log.error("Error in main:", err);
        console.log(JSON.stringify([], null, 2));
    }
}

// Export for use as a module
module.exports = { 
    searchAldi
};

// Run if called directly
if (require.main === module) {
    main();
}
