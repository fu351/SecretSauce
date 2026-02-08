const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

// Environment variables for configuration
const EXA_API_KEY = process.env.EXA_API_KEY || "your_exa_api_key_here";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your_openai_api_key_here";
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 15000);
const WALMART_TIMEOUT_MS = Number(process.env.WALMART_TIMEOUT_MS || 15000);
const WALMART_MAX_RETRIES = Number(process.env.WALMART_MAX_RETRIES || 2);
const WALMART_RETRY_DELAY_MS = Number(process.env.WALMART_RETRY_DELAY_MS || 1000);

// Rate limiting configuration
const WALMART_REQUESTS_PER_SECOND = Number(process.env.WALMART_REQUESTS_PER_SECOND || 2);
const WALMART_MIN_REQUEST_INTERVAL_MS = Number(process.env.WALMART_MIN_REQUEST_INTERVAL_MS || 500);
const WALMART_ENABLE_JITTER = process.env.WALMART_ENABLE_JITTER !== 'false'; // Enabled by default

// Rate limiter state
const rateLimiter = {
    lastRequestTime: 0,
    requestCount: 0,
    windowStart: Date.now(),
    windowDuration: 1000, // 1 second window
};

// Rate limiting function
async function enforceRateLimit() {
    const now = Date.now();

    // Reset window if it's been more than windowDuration
    if (now - rateLimiter.windowStart >= rateLimiter.windowDuration) {
        rateLimiter.windowStart = now;
        rateLimiter.requestCount = 0;
    }

    // Check if we've hit the requests per second limit
    if (rateLimiter.requestCount >= WALMART_REQUESTS_PER_SECOND) {
        const waitTime = rateLimiter.windowDuration - (now - rateLimiter.windowStart);
        if (waitTime > 0) {
            console.log(`[walmart] Rate limit: ${rateLimiter.requestCount} requests in window, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            // Reset window after waiting
            rateLimiter.windowStart = Date.now();
            rateLimiter.requestCount = 0;
        }
    }

    // Enforce minimum interval between requests
    const timeSinceLastRequest = now - rateLimiter.lastRequestTime;
    if (timeSinceLastRequest < WALMART_MIN_REQUEST_INTERVAL_MS) {
        const waitTime = WALMART_MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;

        // Add jitter (randomize delay by ±20%) to appear more human-like
        const jitter = WALMART_ENABLE_JITTER
            ? waitTime * (0.8 + Math.random() * 0.4)
            : waitTime;

        console.log(`[walmart] Rate limit: enforcing ${Math.round(jitter)}ms delay between requests`);
        await new Promise(resolve => setTimeout(resolve, jitter));
    }

    // Update state
    rateLimiter.lastRequestTime = Date.now();
    rateLimiter.requestCount++;
}

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

// Utility function for exponential backoff retry
async function withRetry(fn, options = {}) {
    const {
        maxRetries = WALMART_MAX_RETRIES,
        baseDelay = WALMART_RETRY_DELAY_MS,
        maxDelay = 10000,
        timeoutMultiplier = 1.5,
        initialTimeout = WALMART_TIMEOUT_MS,
        retryOn404 = false // Don't retry 404s by default
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Calculate dynamic timeout: increases with each retry
            const currentTimeout = Math.min(
                initialTimeout * Math.pow(timeoutMultiplier, attempt),
                initialTimeout * 3 // Cap at 3x the initial timeout
            );

            console.log(`[walmart] Attempt ${attempt + 1}/${maxRetries + 1} with timeout ${currentTimeout}ms`);

            return await fn(currentTimeout, attempt);
        } catch (error) {
            lastError = error;

            // Check if we should skip retrying based on error type
            if (error.response) {
                const status = error.response.status;

                // Don't retry 404s unless explicitly requested
                if (status === 404 && !retryOn404) {
                    console.warn(`[walmart] Received 404 error, not retrying (attempt ${attempt + 1})`);
                    break;
                }

                // Don't retry client errors (400-499) except 429 (rate limit)
                if (status >= 400 && status < 500 && status !== 429) {
                    console.warn(`[walmart] Client error ${status}, not retrying (attempt ${attempt + 1})`);
                    break;
                }
            }

            // Don't retry on the last attempt
            if (attempt === maxRetries) {
                break;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

            console.log(`[walmart] Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay}ms...`);

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchWalmartSearchHtml(keyword, zipCode) {
    const params = new URLSearchParams({
        q: keyword,
        ps: "40",
        sort: "best_match"
    });

    if (zipCode) {
        params.set("postalCode", zipCode);
    }

    const url = `https://www.walmart.com/search?${params.toString()}`;

    const headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
    };

    try {
        const response = await withRetry(async (currentTimeout, attempt) => {
            console.log(`[walmart] Fetching search results for "${keyword}" (ZIP: ${zipCode || 'none'}) (attempt ${attempt + 1})`);

            // Enforce rate limiting before making request
            await enforceRateLimit();

            return await withTimeout(
                axios.get(url, {
                    headers,
                    timeout: Math.floor(currentTimeout * 0.9),
                    validateStatus: function (status) {
                        // Don't throw on any status, we'll handle it ourselves
                        return status < 600;
                    }
                }),
                currentTimeout
            );
        }, {
            initialTimeout: WALMART_TIMEOUT_MS,
            maxRetries: WALMART_MAX_RETRIES,
            baseDelay: WALMART_RETRY_DELAY_MS,
            retryOn404: false
        });

        // Check response status
        if (response.status === 404) {
            console.error(`[walmart] Walmart returned 404 for keyword "${keyword}"`);
            console.error(`[walmart] URL: ${url}`);
            return null;
        }

        if (response.status !== 200) {
            console.error(`[walmart] Walmart returned status ${response.status} for keyword "${keyword}"`);
            console.error(`[walmart] Response length: ${response.data?.length || 0} chars`);
            return null;
        }

        const htmlLength = response.data?.length || 0;
        console.log(`[walmart] Successfully fetched HTML (${htmlLength} chars) for "${keyword}"`);

        return response.data;

    } catch (error) {
        if (error.response) {
            console.error(`[walmart] HTTP error ${error.response.status} fetching search page:`, error.message);
            console.error(`[walmart] Request details: Keyword: "${keyword}", ZIP: ${zipCode || 'none'}`);
            console.error(`[walmart] URL: ${url}`);

            // Log response data for debugging
            if (error.response.data) {
                const dataStr = typeof error.response.data === 'string'
                    ? error.response.data
                    : JSON.stringify(error.response.data);
                console.error(`[walmart] Response excerpt:`, dataStr.substring(0, 500));
            }

            // Special handling for specific errors
            if (error.response.status === 403) {
                console.error(`[walmart] ⚠️  403 Forbidden - Possible causes:`);
                console.error(`[walmart]    1. Rate limiting or bot detection`);
                console.error(`[walmart]    2. IP address may be blocked`);
                console.error(`[walmart]    3. Need to reduce request rate`);
            } else if (error.response.status === 503) {
                console.error(`[walmart] ⚠️  503 Service Unavailable - Walmart servers may be overloaded`);
            }
        } else if (error.request) {
            console.error("[walmart] No response received from Walmart:", error.message);
            console.error("[walmart] Network error or Walmart servers may be down");
        } else if (error.message?.includes('timeout')) {
            console.error(`[walmart] Request timed out after ${WALMART_TIMEOUT_MS}ms:`, error.message);
            console.error(`[walmart] Consider increasing WALMART_TIMEOUT_MS environment variable`);
        } else {
            console.error("[walmart] Unexpected error fetching search page:", error.message);
            console.error("[walmart] Error type:", error.constructor.name);
        }

        return null;
    }
}

function extractReduxState(html) {
    const marker = "window.__WML_REDUX_INITIAL_STATE__ = ";
    const startIndex = html.indexOf(marker);

    if (startIndex === -1) {
        console.error("[walmart] Redux state marker not found in HTML");
        console.error("[walmart] HTML length:", html?.length || 0);
        console.error("[walmart] HTML preview:", html?.substring(0, 500));

        // Check for common blocking patterns
        if (html?.includes("access denied") || html?.includes("blocked")) {
            console.error("[walmart] ⚠️  Appears to be blocked by Walmart");
        }
        if (html?.includes("captcha") || html?.includes("CAPTCHA")) {
            console.error("[walmart] ⚠️  CAPTCHA detected - consider reducing request rate");
        }
        if (html?.includes("rate limit") || html?.includes("too many requests")) {
            console.error("[walmart] ⚠️  Rate limited by Walmart");
        }

        return null;
    }

    const start = startIndex + marker.length;
    const end = html.indexOf(";</script>", start);

    if (end === -1) {
        console.error("[walmart] Redux state closing marker not found");
        console.error("[walmart] Content after marker:", html.substring(start, start + 200));
        return null;
    }

    let jsonString = html.slice(start, end).trim();
    jsonString = jsonString.replace(/\bundefined\b/g, "null").replace(/\bNaN\b/g, "null");

    try {
        const state = JSON.parse(jsonString);
        console.log("[walmart] Successfully parsed Redux state");

        // Log structure for debugging
        const topKeys = Object.keys(state || {});
        console.log("[walmart] Redux state top-level keys:", topKeys);

        return state;
    } catch (error) {
        console.error("[walmart] Failed to parse Walmart Redux state:", error.message);
        console.error("[walmart] JSON string length:", jsonString.length);
        console.error("[walmart] JSON preview:", jsonString.substring(0, 200));
        return null;
    }
}

// Extract store location from Walmart Redux state
function extractStoreLocation(state, fallbackZip) {
    try {
        // Try to find store info in various locations in the Redux state
        const storeData =
            state?.store?.selectedStore ||
            state?.store?.preferredStore ||
            state?.stores?.selectedStore ||
            state?.location?.selectedStore ||
            state?.header?.store ||
            null;

        if (storeData) {
            const address = storeData.address || storeData.storeAddress || {};
            const line1 = address.addressLineOne || address.address1 || address.street || "";
            const city = address.city || storeData.city || "";
            const stateCode = address.state || storeData.state || "";
            const postalCode = address.postalCode || address.zip || storeData.zip || fallbackZip || "";

            // Build full address if we have enough components
            if (line1 && city && stateCode) {
                const fullAddress = [line1, city, stateCode, postalCode].filter(Boolean).join(", ");
                return {
                    id: storeData.storeId || storeData.id,
                    name: storeData.storeName || storeData.name || "Walmart",
                    fullAddress,
                    city,
                    state: stateCode,
                    postalCode
                };
            }

            // Fallback to city, state if no full address
            if (city && stateCode) {
                return {
                    id: storeData.storeId || storeData.id,
                    name: storeData.storeName || storeData.name || "Walmart",
                    fullAddress: `${city}, ${stateCode}`,
                    city,
                    state: stateCode,
                    postalCode
                };
            }
        }

        // If no store data found but we have a zip, use that
        if (fallbackZip) {
            return {
                fullAddress: `Walmart (${fallbackZip})`,
                postalCode: fallbackZip
            };
        }

        return null;
    } catch (error) {
        console.warn("Error extracting Walmart store location:", error.message);
        return null;
    }
}

function formatWalmartStoreLocation(storeInfo, fallbackZip) {
    // Note: Walmart's Redux state often contains a cached/preferred store from cookies
    // that may not be the nearest store to the user's zip code.
    // We intentionally use a fallback format here to let the geocoding system
    // use Google Places Nearby Search to find the actual nearest Walmart store.
    //
    // If we have a zip code, use it to help with geocoding
    if (fallbackZip) {
        return `Walmart (${fallbackZip})`;
    }
    return "Walmart Grocery";
}

function getWalmartLocationLabel(zipCode) {
    if (zipCode) {
        return `Walmart (${zipCode})`;
    }
    return "Walmart Grocery";
}

function resolveWalmartEntity(rawItem, state) {
    if (!rawItem) return null
    if (rawItem.product) return resolveWalmartEntity(rawItem.product, state)
    if (rawItem.item) return resolveWalmartEntity(rawItem.item, state)

    const productId = rawItem.productId || rawItem.productIds?.[0]
    if (productId && state?.entities?.products?.[productId]) {
        return state.entities.products[productId]
    }

    const usItemId = rawItem.usItemId || rawItem.itemId || rawItem.id
    if (usItemId && state?.entities?.items?.[usItemId]) {
        return state.entities.items[usItemId]
    }

    if (typeof rawItem === "string") {
        if (state?.entities?.items?.[rawItem]) {
            return state.entities.items[rawItem]
        }
        if (state?.entities?.products?.[rawItem]) {
            return state.entities.products[rawItem]
        }
    }

    return rawItem
}

function normalizeWalmartItem(rawItem, storeLocationLabel) {
    if (!rawItem) return null;

    const productIdRaw = rawItem.usItemId || rawItem.productId || rawItem.itemId || null;
    const productId = productIdRaw == null ? null : String(productIdRaw);
    const title = (rawItem.title || rawItem.name || rawItem.productName || "").trim();
    if (!title) return null;

    const brand = rawItem.brand && typeof rawItem.brand === "object" ? rawItem.brand.name : rawItem.brand || "";

    const priceInfo = rawItem.priceInfo || rawItem.primaryOffer || {};
    let price =
        typeof priceInfo.currentPrice === "number"
            ? priceInfo.currentPrice
            : typeof priceInfo.currentPrice?.price === "number"
              ? priceInfo.currentPrice.price
              : typeof priceInfo.price === "number"
                ? priceInfo.price
                : null;

    if (price === null && typeof priceInfo.currentPrice?.priceString === "string") {
        price = parseFloat(priceInfo.currentPrice.priceString.replace(/[^0-9.]/g, ""));
    }

    if (!Number.isFinite(price) || price <= 0) {
        return null;
    }

    const unitPriceText =
        priceInfo?.unitPrice?.priceString ||
        priceInfo?.unitPriceString ||
        priceInfo?.currentPrice?.priceDisplay ||
        "";

    const image =
        rawItem.imageInfo?.thumbnailUrl ||
        rawItem.imageInfo?.imageUrl ||
        rawItem.imageInfo?.allImages?.[0]?.url ||
        rawItem.primaryImageUrl ||
        rawItem.image ||
        "/placeholder.svg";

    return {
        product_name: title,
        title,
        brand: brand || "",
        price: Math.round(price * 100) / 100,
        pricePerUnit: unitPriceText || "",
        unit: rawItem.unit || "",
        image_url: image,
        provider: "Walmart",
        product_id: productId,
        id: productId,
        location: storeLocationLabel || "Walmart Grocery",
        category: rawItem.category?.name || "Grocery"
    };
}

function parseWalmartHtml(html, zipCode) {
    if (!html) {
        console.error("[walmart] No HTML provided to parseWalmartHtml");
        return [];
    }

    const state = extractReduxState(html);
    if (!state) {
        console.error("[walmart] Failed to extract Redux state - cannot parse products");
        return [];
    }

    // Extract store location from Redux state
    const storeInfo = extractStoreLocation(state, zipCode);
    const storeLocationLabel = formatWalmartStoreLocation(storeInfo, zipCode);
    console.log("[walmart] Store location label:", storeLocationLabel);

    const stackSources = [];
    const searchContent = state?.search?.searchContent;
    if (searchContent?.searchResult?.itemStacks) {
        stackSources.push(...searchContent.searchResult.itemStacks);
    }
    if (searchContent?.productResult?.itemStacks) {
        stackSources.push(...searchContent.productResult.itemStacks);
    }
    const productCollectionStacks = state?.search?.productCollection?.stackMeta?.stacks;
    if (Array.isArray(productCollectionStacks)) {
        stackSources.push(...productCollectionStacks);
    }

    const items = [];
    for (const stack of stackSources) {
        const stackItems = stack?.items || stack?.itemArray || [];
        stackItems.forEach((item) => items.push(item));
    }

    // Fallback if stack parsing failed: attempt to read a flat items array
    if (items.length === 0 && Array.isArray(searchContent?.searchResult?.itemStacks?.[0]?.items)) {
        items.push(...searchContent.searchResult.itemStacks[0].items);
    }

    const normalized = items
        .map((item) => resolveWalmartEntity(item, state))
        .map((item) => normalizeWalmartItem(item, storeLocationLabel))
        .filter(Boolean);

    const seen = new Set();
    const deduped = [];
    for (const product of normalized) {
        const dedupeKey = product.product_id || product.id || `${product.title}-${product.price}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        deduped.push(product);
    }

    if (deduped.length < 5 && state?.entities) {
        const extraSources = [];
        if (state.entities.items) {
            extraSources.push(...Object.values(state.entities.items))
        }
        if (state.entities.products) {
            extraSources.push(...Object.values(state.entities.products))
        }

        for (const source of extraSources) {
            const normalizedExtra = normalizeWalmartItem(source, storeLocationLabel)
            const extraDedupeKey = normalizedExtra?.product_id || normalizedExtra?.id || `${normalizedExtra?.title}-${normalizedExtra?.price}`
            if (normalizedExtra && !seen.has(extraDedupeKey)) {
                seen.add(extraDedupeKey)
                deduped.push(normalizedExtra)
            }
            if (deduped.length >= 12) {
                break
            }
        }
    }

    return deduped.slice(0, 12);
}

async function searchWalmartDirect(keyword, zipCode) {
    try {
        const html = await fetchWalmartSearchHtml(keyword, zipCode);

        if (!html) {
            console.error(`[walmart] Failed to fetch HTML for "${keyword}"`);
            return [];
        }

        const parsed = parseWalmartHtml(html, zipCode);
        console.log(`[walmart] Direct parser extracted ${parsed.length} items for "${keyword}"`);

        if (parsed.length === 0) {
            console.warn(`[walmart] ⚠️  No products found for "${keyword}" - possible causes:`);
            console.warn(`[walmart]    1. Redux state structure may have changed`);
            console.warn(`[walmart]    2. No products match the keyword`);
            console.warn(`[walmart]    3. Walmart may be blocking scraping attempts`);
        }

        return parsed;
    } catch (error) {
        console.error("[walmart] Error in direct Walmart parser:", error.message);
        console.error("[walmart] Stack trace:", error.stack?.substring(0, 500));
        return [];
    }
}

// Function to crawl Walmart search page using Exa API
async function crawlWalmartWithExa(keyword, zipCode) {
    if (!EXA_API_KEY || EXA_API_KEY.includes("your_exa_api_key_here")) {
        console.warn("Exa API key not configured; skipping Exa fallback for Walmart scraper")
        return null
    }
    try {
        console.log(`Crawling Walmart search page for: ${keyword}`);
        
        // Build Walmart search URL
        const walmartSearchUrl = `https://www.walmart.com/search?q=${encodeURIComponent(keyword)}`;
        
        // Call Exa API to crawl the page
        const response = await withTimeout(
            axios.post('https://api.exa.ai/contents', {
                urls: [walmartSearchUrl],
                text: {
                    maxCharacters: 50000,  // Limit content size for cost control
                    includeHtmlTags: false
                },
                livecrawl: "always",  // Always use fresh crawl
                livecrawlTimeout: 15000  // 15 second timeout
            }, {
                headers: {
                    'x-api-key': EXA_API_KEY,
                    'Content-Type': 'application/json'
                }
            }),
            Math.max(REQUEST_TIMEOUT_MS, 20000)
        );

        if (!response.data || !response.data.results || response.data.results.length === 0) {
            console.warn("No content retrieved from Exa API");
            return null;
        }

        return response.data.results[0].text;
        
    } catch (error) {
        console.error("Error crawling with Exa:", error.message);
        return null;
    }
}

// Function to parse products from crawled content using LLM
async function parseProductsWithLLM(crawledContent, keyword, zipCode) {
    if (!OPENAI_API_KEY || OPENAI_API_KEY.includes("your_openai_api_key_here")) {
        console.warn("OpenAI API key not configured; skipping Walmart LLM parsing fallback")
        return []
    }
    try {
        console.log(`Parsing products with LLM for keyword: ${keyword}`);
        
        const prompt = `
You are a web scraping assistant. Extract the top 5 grocery/food products and their prices from this Walmart search page content.

Search keyword: "${keyword}"

Instructions:
1. Find products that match or are related to "${keyword}"
2. Extract exactly 5 products (or fewer if less available)
3. For each product, extract: title, brand, price, image URL if visible
4. Focus on grocery/food items only
5. Return ONLY valid JSON in this exact format:

[
  {
    "title": "Product Name Here",
    "brand": "Brand Name (or empty string if none)",
    "price": 4.99,
    "image_url": "image URL if found (or empty string)",
    "id": "unique-identifier"
  }
]

Walmart page content:
${crawledContent.substring(0, 30000)}  // Limit content to stay within token limits

Return only the JSON array, no other text.`;

        const response = await withTimeout(
            axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o-mini",  // Cost-effective model
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
                temperature: 0.1  // Low temperature for consistent results
            }, {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }),
            REQUEST_TIMEOUT_MS
        );

        if (!response.data?.choices?.[0]?.message?.content) {
            console.warn("No content returned from LLM");
            return [];
        }

        const llmResponse = response.data.choices[0].message.content.trim();
        
        // Clean LLM response - remove markdown code blocks if present
        const cleanedResponse = llmResponse
            .replace(/^```json\s*\n?/i, '')  // Remove opening ```json
            .replace(/\n?```\s*$/i, '')      // Remove closing ```
            .trim();
        
        // Parse JSON from cleaned LLM response
        const products = JSON.parse(cleanedResponse);
        
        // Validate and format products
        return products
            .filter(product => product.title && product.price && product.price > 0)
            .slice(0, 5)  // Ensure max 5 products
            .map(product => {
                const productName = String(product.title || "").trim();
                const productIdRaw = product.id ?? null;
                const productId = productIdRaw == null ? null : String(productIdRaw);
                const parsedPrice = Number.parseFloat(String(product.price));

                return {
                product_name: productName,
                title: productName,
                brand: product.brand || "",
                price: Number.isFinite(parsedPrice) ? parsedPrice : null,
                pricePerUnit: "",  // Not available from LLM parsing
                unit: "",
                image_url: product.image_url || "/placeholder.svg",
                provider: "Walmart",
                product_id: productId,
                id: productId,
                location: getWalmartLocationLabel(zipCode),
                category: "Grocery"
                };
            })
            .filter((product) => typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0 && product.product_name);

    } catch (error) {
        console.error("Error parsing products with LLM:", error.message);
        return [];
    }
}

// Main Walmart search function using Exa + LLM
async function searchWalmartWithExa(keyword, zipCode) {
    if (!EXA_API_KEY || EXA_API_KEY.includes("your_exa_api_key_here")) {
        return []
    }
    try {
        // Step 1: Crawl Walmart search page
        const crawledContent = await crawlWalmartWithExa(keyword, zipCode);

        if (!crawledContent) {
            console.log("Failed to crawl Walmart page, real-time prices unavailable");
            return [];
        }

        // Step 2: Parse products using LLM
        const products = await parseProductsWithLLM(crawledContent, keyword, zipCode);

        if (products.length === 0) {
            console.log("LLM failed to extract products, real-time prices unavailable");
            return [];
        }

        console.log(`Successfully extracted ${products.length} products from Walmart`);
        return products.sort((a, b) => a.price - b.price);  // Sort by price

    } catch (error) {
        console.error("Error in Walmart Exa search:", error.message, "- real-time prices unavailable");
        return [];
    }
}

async function searchWalmart(keyword, zipCode) {
    const directResults = await searchWalmartDirect(keyword, zipCode);
    const exaResults = await searchWalmartWithExa(keyword, zipCode);

    const merged = [];
    const seenKeys = new Set();
    const pushResult = (item) => {
        if (!item) return;
        const key = item.product_id || item.id || `${item.title}-${item.price}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        merged.push(item);
    };

    directResults.forEach(pushResult);
    exaResults.forEach(pushResult);

    if (merged.length === 0) {
        return directResults.length > 0 ? directResults : exaResults;
    }

    return merged.sort((a, b) => a.price - b.price);
}

// Legacy function for backwards compatibility
async function searchWalmartProducts(keyword, zipCode) {
    return await searchWalmart(keyword, zipCode);
}

// Legacy function for backwards compatibility  
async function searchWalmartAPI(keyword, zipCode) {
    return await searchWalmart(keyword, zipCode);
}

// Function to generate fallback mock data if APIs fail
function generateMockWalmartData(keyword) {
    console.log("Generating mock Walmart data as fallback...");

    const basePrice = Math.random() * 8 + 1;
    const timestamp = Date.now();

    return [
        {
            product_id: `walmart-mock-1-${timestamp}`,
            id: `walmart-mock-1-${timestamp}`,
            product_name: `Great Value ${keyword}`,
            title: `Great Value ${keyword}`,
            brand: "Great Value",
            price: Math.round(basePrice * 100) / 100,
            pricePerUnit: "$" + Math.round(basePrice * 100) / 100 + "/lb",
            unit: "lb",
            image_url: "/placeholder.svg",
            provider: "Walmart",
            location: "Walmart Grocery",
            category: "Grocery"
        },
        {
            product_id: `walmart-mock-2-${timestamp}`,
            id: `walmart-mock-2-${timestamp}`,
            product_name: `Fresh ${keyword}`,
            title: `Fresh ${keyword}`,
            brand: "Walmart",
            price: Math.round((basePrice + 0.5) * 100) / 100,
            pricePerUnit: "$" + Math.round((basePrice + 0.5) * 100) / 100 + "/lb",
            unit: "lb",
            image_url: "/placeholder.svg",
            provider: "Walmart",
            location: "Walmart Grocery",
            category: "Grocery"
        },
        {
            product_id: `walmart-mock-3-${timestamp}`,
            id: `walmart-mock-3-${timestamp}`,
            product_name: `Premium ${keyword}`,
            title: `Premium ${keyword}`,
            brand: "Name Brand",
            price: Math.round((basePrice + 1) * 100) / 100,
            pricePerUnit: "$" + Math.round((basePrice + 1) * 100) / 100 + "/lb",
            unit: "lb",
            image_url: "/placeholder.svg",
            provider: "Walmart",
            location: "Walmart Grocery",
            category: "Grocery"
        },
        {
            product_id: `walmart-mock-4-${timestamp}`,
            id: `walmart-mock-4-${timestamp}`,
            product_name: `Organic ${keyword}`,
            title: `Organic ${keyword}`,
            brand: "Organic Select",
            price: Math.round((basePrice + 1.5) * 100) / 100,
            pricePerUnit: "$" + Math.round((basePrice + 1.5) * 100) / 100 + "/lb",
            unit: "lb",
            image_url: "/placeholder.svg",
            provider: "Walmart",
            location: "Walmart Grocery",
            category: "Grocery"
        },
        {
            product_id: `walmart-mock-5-${timestamp}`,
            id: `walmart-mock-5-${timestamp}`,
            product_name: `Store Brand ${keyword}`,
            title: `Store Brand ${keyword}`,
            brand: "Walmart Value",
            price: Math.round((basePrice - 0.5) * 100) / 100,
            pricePerUnit: "$" + Math.round((basePrice - 0.5) * 100) / 100 + "/lb",
            unit: "lb",
            image_url: "/placeholder.svg",
            provider: "Walmart",
            location: "Walmart Grocery",
            category: "Grocery"
        }
    ];
}

// Main function to execute the script
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        console.error("Usage: node walmart.js <keyword> <zipCode>");
        console.error("Note: You need EXA_API_KEY and OPENAI_API_KEY environment variables");
        process.exit(1);
    }

    // Check for required API keys
    if (EXA_API_KEY === "your_exa_api_key_here" || OPENAI_API_KEY === "your_openai_api_key_here") {
        console.warn("⚠️  Missing API keys - using mock data");
        console.warn("Set EXA_API_KEY and OPENAI_API_KEY environment variables for real data");
        console.log(JSON.stringify(generateMockWalmartData(keyword)));
        return;
    }

    try {
        console.log(`🔍 Searching Walmart for "${keyword}" using Exa + LLM approach...`);

        // Use new Exa + LLM approach
        const results = await searchWalmartWithExa(keyword, zipCode);

        if (results.length === 0) {
            console.log("No results from Exa/LLM approach, real-time prices unavailable");
        }

        console.log(JSON.stringify(results));

    } catch (err) {
        console.error("Error in main:", err);
        console.log(JSON.stringify([]));
    }
}

// Export for use as a module - new primary function
module.exports = { 
    searchWalmartWithExa,           // Expose fallback
    searchWalmartProducts,          // Legacy compatibility
    searchWalmartAPI               // Legacy compatibility  
};

// Run if called directly
if (require.main === module) {
    main();
}
