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
const EXA_API_KEY = process.env.EXA_API_KEY || "your_exa_api_key_here";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your_openai_api_key_here";
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

    const response = await withTimeout(axios.get(url, { headers }), 15000);
    return response.data;
}

function extractReduxState(html) {
    const marker = "window.__WML_REDUX_INITIAL_STATE__ = ";
    const startIndex = html.indexOf(marker);
    if (startIndex === -1) {
        return null;
    }

    const start = startIndex + marker.length;
    const end = html.indexOf(";</script>", start);
    if (end === -1) {
        return null;
    }

    let jsonString = html.slice(start, end).trim();
    jsonString = jsonString.replace(/\bundefined\b/g, "null").replace(/\bNaN\b/g, "null");

    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Failed to parse Walmart redux state:", error.message);
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

    const id = rawItem.usItemId || rawItem.productId || rawItem.itemId || `walmart-${Math.random()}`;
    const title = rawItem.title || rawItem.name || rawItem.productName;
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
        id,
        title,
        brand: brand || "",
        price: Math.round(price * 100) / 100,
        pricePerUnit: unitPriceText || "",
        unit: rawItem.unit || "",
        image_url: image,
        provider: "Walmart",
        location: storeLocationLabel || "Walmart Grocery",
        category: rawItem.category?.name || "Grocery"
    };
}

function parseWalmartHtml(html, zipCode) {
    const state = extractReduxState(html);
    if (!state) return [];

    // Extract store location from Redux state
    const storeInfo = extractStoreLocation(state, zipCode);
    const storeLocationLabel = formatWalmartStoreLocation(storeInfo, zipCode);

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
        if (seen.has(product.id)) continue;
        seen.add(product.id);
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
            if (normalizedExtra && !seen.has(normalizedExtra.id)) {
                seen.add(normalizedExtra.id)
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
        const parsed = parseWalmartHtml(html, zipCode);
        console.log(`Direct Walmart parser extracted ${parsed.length} items for ${keyword}`);
        return parsed;
    } catch (error) {
        console.error("Error in direct Walmart parser:", error.message);
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
            20000  // 20 second total timeout
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
async function parseProductsWithLLM(crawledContent, keyword) {
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
            15000  // 15 second timeout
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
            .map(product => ({
                id: product.id || `walmart-${Math.random()}`,
                title: product.title,
                brand: product.brand || "",
                price: parseFloat(product.price),
                pricePerUnit: "",  // Not available from LLM parsing
                unit: "",
                image_url: product.image_url || "/placeholder.svg",
                provider: "Walmart",
                location: "Walmart Grocery", 
                category: "Grocery"
            }));

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
        const products = await parseProductsWithLLM(crawledContent, keyword);

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
        const key = item.id || `${item.title}-${item.price}`;
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
            id: `walmart-mock-1-${timestamp}`,
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
            id: `walmart-mock-2-${timestamp}`,
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
            id: `walmart-mock-3-${timestamp}`,
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
            id: `walmart-mock-4-${timestamp}`,
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
            id: `walmart-mock-5-${timestamp}`,
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
