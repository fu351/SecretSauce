const path = require('path');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { getOpenAIApiKey, hasConfiguredOpenAIKey, requestOpenAIJson } = require('../utils/llm-fallback');
const { createRateLimiter } = require('../utils/rate-limiter');
const { logHttpErrorToDatabase } = require('../utils/db-error-logger');
const { createResultCache } = require('../utils/result-cache');
const { createJinaCrawler } = require('../utils/jina-crawler');

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
    if (!content) return { products: [], hasUnresolved: true };

    const products = [];

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

        // Avoid duplicates by name+price
        const isDupe = products.some(
            p => p.title.toLowerCase() === productName.toLowerCase() && p.price === price
        );
        if (isDupe) continue;

        products.push({
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
    if (products.length === 0) {
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

            const isDupe = products.some(
                p => p.title.toLowerCase() === productName.toLowerCase() && p.price === price
            );
            if (isDupe) continue;

            const windowEnd = Math.min(content.length, priceMatch2.index + 400);
            const window = content.slice(priceMatch2.index, windowEnd);
            const imgMatch = window.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);

            products.push({
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

            if (products.length >= 5) break;
        }
    }

    const limited = products.slice(0, 5);
    // hasUnresolved = true tells the caller to still run LLM as a fallback if regex found nothing
    return { products: limited, hasUnresolved: limited.length === 0 };
}

// Function to parse products from crawled content using LLM
async function parseProductsWithLLM(crawledContent, keyword) {
    try {
        log.debug(`Parsing Aldi products with LLM for keyword: ${keyword}`);

        if (!hasConfiguredOpenAIKey(OPENAI_API_KEY)) {
            log.warn("Missing OPENAI_API_KEY, cannot parse Aldi products with LLM");
            return [];
        }
        
        const prompt = `
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
${crawledContent.substring(0, 30000)}

Return only the JSON array, no other text.`;

        const products = await requestOpenAIJson({
            prompt,
            openAiApiKey: OPENAI_API_KEY,
            maxTokens: 2000,
            temperature: 0.1,
            timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
        });

        if (!Array.isArray(products)) {
            log.warn("No content returned from LLM");
            return [];
        }
        
        return products
            .filter(product => product.title && product.price && product.price > 0)
            .slice(0, 5)
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
            }));

    } catch (error) {
        log.error("Error parsing products with LLM:", error.message);
        if (error?.response?.data) {
            log.error("LLM Error Response:", error.response.data);
        }
        return [];
    }
}

// Main Aldi search function
async function searchAldi(keyword, zipCode) {
    const cacheKey = resultCache.buildKey(keyword, zipCode);
    const cached = resultCache.get(cacheKey);
    if (cached) return cached;

    const inFlight = resultCache.getInFlight(cacheKey);
    if (inFlight) return inFlight;

    const promise = (async () => {
    try {
        // Step 1: Crawl Aldi page
        const crawledContent = await crawlAldiWithJina(keyword, zipCode);

        if (!crawledContent) {
            log.debug("Failed to crawl Aldi page, real-time prices unavailable");
            return [];
        }

        // Step 2: Try regex extraction first (fast, free, no API call)
        const { products: regexProducts, hasUnresolved } = parseProductsWithRegex(crawledContent, keyword);
        if (regexProducts.length > 0) {
            log.debug(`Regex extracted ${regexProducts.length} products from Aldi`);
            const results = regexProducts.sort((a, b) => a.price - b.price);
            resultCache.set(cacheKey, results);
            return results;
        }

        // Step 3: Regex found nothing — fall back to LLM
        if (hasUnresolved) {
            log.debug("Regex found no products, falling back to LLM");
            const products = await parseProductsWithLLM(crawledContent, keyword);
            if (products.length === 0) {
                log.debug("LLM failed to extract products, real-time prices unavailable");
                return [];
            }
            log.debug(`LLM extracted ${products.length} products from Aldi`);
            const results = products.sort((a, b) => a.price - b.price);
            resultCache.set(cacheKey, results);
            return results;
        }

        log.debug("No products found from Aldi");
        return [];

    } catch (error) {
        log.error("Error in Aldi search:", error.message, "- real-time prices unavailable");
        return [];
    }
    })();

    resultCache.setInFlight(cacheKey, promise);
    try {
        return await promise;
    } finally {
        resultCache.deleteInFlight(cacheKey);
    }
}

// Function to generate fallback mock data
function generateMockAldiData(keyword) {
    log.debug("Generating mock Aldi data as fallback...");

    const basePrice = Math.random() * 7 + 1.5;
    const timestamp = Date.now();

    return [
        {
            id: `aldi-mock-1-${timestamp}`,
            title: `Aldi ${keyword}`,
            brand: "ALDI",
            price: Math.round(basePrice * 100) / 100,
            pricePerUnit: "$" + Math.round(basePrice * 100) / 100 + "/lb",
            unit: "lb",
            rawUnit: "lb",
            image_url: "/placeholder.svg",
            provider: "Aldi",
            location: "Aldi Grocery",
            category: "Grocery"
        },
        {
            id: `aldi-mock-2-${timestamp}`,
            title: `Organic ${keyword}`,
            brand: "Simply Nature",
            price: Math.round((basePrice + 0.75) * 100) / 100,
            pricePerUnit: "$" + Math.round((basePrice + 0.75) * 100) / 100 + "/lb",
            unit: "lb",
            rawUnit: "lb",
            image_url: "/placeholder.svg",
            provider: "Aldi",
            location: "Aldi Grocery",
            category: "Grocery"
        },
        {
            id: `aldi-mock-3-${timestamp}`,
            title: `Premium ${keyword}`,
            brand: "Specially Selected",
            price: Math.round((basePrice + 1.5) * 100) / 100,
            pricePerUnit: "$" + Math.round((basePrice + 1.5) * 100) / 100 + "/lb",
            unit: "lb",
            rawUnit: "lb",
            image_url: "/placeholder.svg",
            provider: "Aldi",
            location: "Aldi Grocery",
            category: "Grocery"
        },
        {
            id: `aldi-mock-4-${timestamp}`,
            title: `${keyword} Blend`,
            brand: "ALDI",
            price: Math.round((basePrice - 0.25) * 100) / 100,
            pricePerUnit: "$" + Math.round((basePrice - 0.25) * 100) / 100 + "/lb",
            unit: "lb",
            rawUnit: "lb",
            image_url: "/placeholder.svg",
            provider: "Aldi",
            location: "Aldi Grocery",
            category: "Grocery"
        },
        {
            id: `aldi-mock-5-${timestamp}`,
            title: `Fresh ${keyword}`,
            brand: "Earth Grown",
            price: Math.round((basePrice + 1) * 100) / 100,
            pricePerUnit: "$" + Math.round((basePrice + 1) * 100) / 100 + "/lb",
            unit: "lb",
            rawUnit: "lb",
            image_url: "/placeholder.svg",
            provider: "Aldi",
            location: "Aldi Grocery",
            category: "Grocery"
        }
    ];
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
        console.log(JSON.stringify(generateMockAldiData(keyword), null, 2));
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
