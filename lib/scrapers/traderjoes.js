const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

// Environment variables for API keys
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your_openai_api_key_here";
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 25000);
const TJ_CACHE_TTL_MS = Number(process.env.TRADERJOES_CACHE_TTL_MS || 5 * 60 * 1000);
const DEFAULT_BATCH_CONCURRENCY = Number(process.env.TRADERJOES_BATCH_CONCURRENCY || 3);
const MAX_BATCH_CONCURRENCY = 8;

// In-memory dedupe + cache to avoid duplicate crawl/LLM calls for identical queries.
const traderJoesResultCache = new Map();
const traderJoesInFlight = new Map();

function normalizeKeyword(keyword) {
    return String(keyword || "").trim().toLowerCase();
}

function buildCacheKey(keyword, zipCode) {
    return `${normalizeKeyword(keyword)}::${String(zipCode || "").trim()}`;
}

function getCachedResult(cacheKey) {
    const cached = traderJoesResultCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (Date.now() - cached.fetchedAt > TJ_CACHE_TTL_MS) {
        traderJoesResultCache.delete(cacheKey);
        return null;
    }

    return cached.results;
}

function setCachedResult(cacheKey, results) {
    traderJoesResultCache.set(cacheKey, {
        fetchedAt: Date.now(),
        results,
    });
}

// Function to crawl Trader Joe's search page using Jina AI Reader API
async function crawlTraderJoesWithJina(keyword) {
    try {
        console.log(`Crawling Trader Joe's search page for: ${keyword} using Jina AI`);
        
        // Build Trader Joe's search URL
        const searchUrl = `https://www.traderjoes.com/home/search?q=${encodeURIComponent(keyword)}&section=products&global=yes`;
        const jinaReaderUrl = `https://r.jina.ai/${searchUrl}`;
        
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            // We are NOT setting "X-Retain-Images": "none" to get image URLs
        };

        // Call Jina AI Reader API
        const response = await withTimeout(
            axios.get(jinaReaderUrl, {
                headers: headers,
                timeout: Math.max(10000, REQUEST_TIMEOUT_MS - 5000),
            }),
            REQUEST_TIMEOUT_MS
        );

        if (!response.data) {
            console.warn("No content retrieved from Jina AI API");
            return null;
        }

        // Jina returns the clean markdown text directly
        return response.data;
        
    } catch (error) {
        console.error("Error crawling with Jina AI:", error.message);
        return null;
    }
}

// Function to parse products from crawled content using LLM
async function parseProductsWithLLM(crawledContent, keyword) {
    try {
        console.log(`Parsing products with LLM for keyword: ${keyword}`);

        if (!OPENAI_API_KEY || OPENAI_API_KEY === "your_openai_api_key_here") {
            console.warn("Missing OPENAI_API_KEY, cannot parse Trader Joe's products with LLM");
            return [];
        }
        
        const prompt = `
You are a web scraping assistant. Extract the top 5 grocery/food products and their prices from this Trader Joe's search page content.

Search keyword: "${keyword}"

Instructions:
1. Find products that match or are related to "${keyword}"
2. Extract exactly 5 products (or fewer if less available)
3. For each product, extract: product_name, brand (usually "Trader Joe's"), price, and image URL.
4. The image URL will likely be in markdown format, like \`![alt text](image_url)\`. Extract the URL.
5. Focus on grocery/food items only
6. Return ONLY valid JSON in this exact format:

[
  {
    "product_name": "Product Name Here",
    "brand": "Brand Name (e.g., Trader Joe's)",
    "price": 4.99,
    "image_url": "https://example.com/image.jpg",
    "id": "unique-identifier"
  }
]

Trader Joe's page content:
${crawledContent.substring(0, 30000)}  // Limit content to stay within token limits

Return only the JSON array, no other text.`;

        const response = await withTimeout(
            axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a precise web scraping assistant that returns only valid JSON."
                    },
                    {
                        role: "user", 
                        content: prompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }),
            Math.min(REQUEST_TIMEOUT_MS, 20000)
        );

        if (!response.data?.choices?.[0]?.message?.content) {
            console.warn("No content returned from LLM");
            return [];
        }

        const llmResponse = response.data.choices[0].message.content.trim();
        
        const cleanedResponse = llmResponse
            .replace(/^```json\s*\n?/i, '')
            .replace(/\n?```\s*$/i, '')
            .trim();
        
        const products = JSON.parse(cleanedResponse);
        
        return products
            .filter(product => (product.product_name || product.title) && product.price && product.price > 0)
            .slice(0, 5)
            .map(product => ({
                product_id: product.id ? String(product.id) : null,
                id: product.id ? String(product.id) : null,
                product_name: product.product_name || product.title,
                title: product.product_name || product.title,
                price: parseFloat(product.price),
                image_url: product.image_url || "/placeholder.svg",
                provider: "Trader Joe's",
                location: "Trader Joe's Store",
            }));

    } catch (error) {
        console.error("Error parsing products with LLM:", error.message);
        if (error.response?.data) {
            console.error("LLM Error Response:", error.response.data);
        }
        return [];
    }
}

// Main Trader Joe's search function
async function searchTraderJoes(keyword, zipCode) {
    const cacheKey = buildCacheKey(keyword, zipCode);
    const cached = getCachedResult(cacheKey);
    if (cached) {
        return cached;
    }

    const existingInFlight = traderJoesInFlight.get(cacheKey);
    if (existingInFlight) {
        return existingInFlight;
    }

    const scrapePromise = (async () => {
    try {
        if (!normalizeKeyword(keyword)) {
            return [];
        }

        // Step 1: Crawl Trader Joe's page
        const crawledContent = await crawlTraderJoesWithJina(keyword);

        if (!crawledContent) {
            console.log("Failed to crawl Trader Joe's page, real-time prices unavailable");
            return [];
        }

        // Step 2: Parse products using LLM
        const products = await parseProductsWithLLM(crawledContent, keyword);

        if (products.length === 0) {
            console.log("LLM failed to extract products, real-time prices unavailable");
            return [];
        }

        console.log(`Successfully extracted ${products.length} products from Trader Joe's`);
        const sorted = products.sort((a, b) => a.price - b.price);
        setCachedResult(cacheKey, sorted);
        return sorted;

    } catch (error) {
        console.error("Error in Trader Joe's search:", error.message, "- real-time prices unavailable");
        return [];
    }
    })();

    traderJoesInFlight.set(cacheKey, scrapePromise);
    try {
        return await scrapePromise;
    } finally {
        traderJoesInFlight.delete(cacheKey);
    }
}

async function searchTraderJoesBatch(keywords, zipCode, options = {}) {
    if (!Array.isArray(keywords) || keywords.length === 0) {
        return [];
    }

    const requestedConcurrency = Number(options?.concurrency || DEFAULT_BATCH_CONCURRENCY);
    const concurrency = Math.max(1, Math.min(MAX_BATCH_CONCURRENCY, requestedConcurrency));

    const results = new Array(keywords.length);
    let cursor = 0;

    async function worker() {
        while (cursor < keywords.length) {
            const index = cursor++;
            const keyword = keywords[index];
            try {
                results[index] = await searchTraderJoes(keyword, zipCode);
            } catch (error) {
                console.error("Trader Joe's batch worker error:", error.message || error);
                results[index] = [];
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
}

// Function to generate fallback mock data
function generateMockTraderJoesData(keyword) {
    console.log("Generating mock Trader Joe's data as fallback...");

    const basePrice = Math.random() * 8 + 2;
    const timestamp = Date.now();

    return [
        {
            product_id: `tj-mock-1-${timestamp}`,
            product_name: `Trader Joe's ${keyword}`,
            price: Math.round(basePrice * 100) / 100,
            image_url: "/placeholder.svg"
        },
        {
            product_id: `tj-mock-2-${timestamp}`,
            product_name: `Organic ${keyword}`,
            price: Math.round((basePrice + 0.75) * 100) / 100,
            image_url: "/placeholder.svg"
        },
        {
            product_id: `tj-mock-3-${timestamp}`,
            product_name: `${keyword} Blend`,
            price: Math.round((basePrice + 1.25) * 100) / 100,
            image_url: "/placeholder.svg"
        },
        {
            product_id: `tj-mock-4-${timestamp}`,
            product_name: `Fresh ${keyword}`,
            price: Math.round((basePrice - 0.5) * 100) / 100,
            image_url: "/placeholder.svg"
        },
        {
            product_id: `tj-mock-5-${timestamp}`,
            product_name: `Premium ${keyword}`,
            price: Math.round((basePrice + 2) * 100) / 100,
            image_url: "/placeholder.svg"
        }
    ];
}

// Main function to execute the script
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        console.error("Usage: node traderjoes.js <keyword> <zipCode>");
        console.error("Note: You need OPENAI_API_KEY environment variable");
        process.exit(1);
    }

    if (OPENAI_API_KEY === "your_openai_api_key_here") {
        console.warn("⚠️  Missing OPENAI_API_KEY - using mock data");
        console.warn("Set OPENAI_API_KEY environment variable for real data");
        console.log(JSON.stringify(generateMockTraderJoesData(keyword), null, 2));
        return;
    }

    try {
        console.log(`🔍 Searching Trader Joe's for "${keyword}" using Jina AI + LLM approach...`);

        const results = await searchTraderJoes(keyword, zipCode);

        if (results.length === 0) {
            console.log("No results from Jina/LLM approach, real-time prices unavailable");
        }

        console.log(JSON.stringify(results, null, 2));

    } catch (err) {
        console.error("Error in main:", err);
        console.log(JSON.stringify([], null, 2));
    }
}

// Export for use as a module
module.exports = { 
    searchTraderJoes,
    searchTraderJoesBatch
};

// Run if called directly
if (require.main === module) {
    main();
}
