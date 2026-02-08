const axios = require('axios');
const he = require('he');

// Environment variables for configuration
const TARGET_TIMEOUT_MS = Number(process.env.TARGET_TIMEOUT_MS || 10000);
const TARGET_MAX_RETRIES = Number(process.env.TARGET_MAX_RETRIES || 2);
const TARGET_RETRY_DELAY_MS = Number(process.env.TARGET_RETRY_DELAY_MS || 1000);

// Rate limiting configuration
const TARGET_REQUESTS_PER_SECOND = Number(process.env.TARGET_REQUESTS_PER_SECOND || 2);
const TARGET_MIN_REQUEST_INTERVAL_MS = Number(process.env.TARGET_MIN_REQUEST_INTERVAL_MS || 500);
const TARGET_ENABLE_JITTER = process.env.TARGET_ENABLE_JITTER !== 'false'; // Enabled by default

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
    if (rateLimiter.requestCount >= TARGET_REQUESTS_PER_SECOND) {
        const waitTime = rateLimiter.windowDuration - (now - rateLimiter.windowStart);
        if (waitTime > 0) {
            console.log(`[target] Rate limit: ${rateLimiter.requestCount} requests in window, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            // Reset window after waiting
            rateLimiter.windowStart = Date.now();
            rateLimiter.requestCount = 0;
        }
    }

    // Enforce minimum interval between requests
    const timeSinceLastRequest = now - rateLimiter.lastRequestTime;
    if (timeSinceLastRequest < TARGET_MIN_REQUEST_INTERVAL_MS) {
        const waitTime = TARGET_MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;

        // Add jitter (randomize delay by ±20%) to appear more human-like
        const jitter = TARGET_ENABLE_JITTER
            ? waitTime * (0.8 + Math.random() * 0.4)
            : waitTime;

        console.log(`[target] Rate limit: enforcing ${Math.round(jitter)}ms delay between requests`);
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
        maxRetries = TARGET_MAX_RETRIES,
        baseDelay = TARGET_RETRY_DELAY_MS,
        maxDelay = 10000,
        timeoutMultiplier = 1.5,
        initialTimeout = TARGET_TIMEOUT_MS,
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

            console.log(`[target] Attempt ${attempt + 1}/${maxRetries + 1} with timeout ${currentTimeout}ms`);

            return await fn(currentTimeout, attempt);
        } catch (error) {
            lastError = error;

            // Check if we should skip retrying based on error type
            if (error.response) {
                const status = error.response.status;

                // Don't retry 404s unless explicitly requested
                if (status === 404 && !retryOn404) {
                    console.warn(`[target] Received 404 error, not retrying (attempt ${attempt + 1})`);
                    break;
                }

                // Don't retry client errors (400-499) except 429 (rate limit)
                if (status >= 400 && status < 500 && status !== 429) {
                    console.warn(`[target] Client error ${status}, not retrying (attempt ${attempt + 1})`);
                    break;
                }
            }

            // Don't retry on the last attempt
            if (attempt === maxRetries) {
                break;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

            console.log(`[target] Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay}ms...`);

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

async function getNearestStore(zipCode) {
    const baseUrl = "https://redsky.target.com/redsky_aggregations/v1/web/nearby_stores_v1";
    const params = {
        key: "9f36aeafbe60771e321a7cc95a78140772ab3e96",
        channel: "WEB",
        limit: 2,
        within: 20,
        place: encodeURIComponent(zipCode),
        is_bot: false,
    };
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
    };

    try {
        const response = await withRetry(async (currentTimeout, attempt) => {
            console.log(`[target] Fetching nearest store for ZIP ${zipCode} (attempt ${attempt + 1})`);

            // Enforce rate limiting before making request
            await enforceRateLimit();

            return await withTimeout(
                axios.get(baseUrl, { params, headers, timeout: Math.floor(currentTimeout * 0.9) }),
                currentTimeout
            );
        }, {
            initialTimeout: TARGET_TIMEOUT_MS,
            maxRetries: TARGET_MAX_RETRIES,
            baseDelay: TARGET_RETRY_DELAY_MS
        });

        if (!response.data?.data?.nearby_stores?.stores || response.data.data.nearby_stores.stores.length === 0) {
            console.warn("[target] No stores found within 20 miles of zipcode:", zipCode);
            return null;
        }

        const store = response.data.data.nearby_stores.stores[0];
        const storeId = store?.store_id || store?.storeId || store?.id;
        const address =
            store?.mailing_address ||
            store?.store_address ||
            store?.address ||
            store?.location?.address ||
            store?.mainAddress ||
            {};

        const line1 = address?.address_line1 || address?.line1 || address?.addressLine1 || "";
        const city = address?.city || address?.city_name || "";
        const state = address?.region || address?.state || address?.state_code || "";
        const postalCode = address?.postal_code || address?.zip || address?.zipCode || zipCode;

        // Build full address string for geocoding
        const fullAddress = [line1, city, state, postalCode].filter(Boolean).join(", ");

        console.log(`[target] Successfully found store ${storeId} for ZIP ${zipCode}`);

        return {
            id: storeId,
            name: store?.location_name || store?.store_name || store?.storeName || "Target",
            address: {
                line1,
                city,
                state,
                postalCode,
            },
            fullAddress,
            raw: store,
        };

    } catch (error) {
        if (error.response) {
            console.error(`[target] Error fetching store ID (HTTP ${error.response.status}):`, error.message);
            console.error(`[target] Response data:`, JSON.stringify(error.response.data).substring(0, 500));
        } else if (error.request) {
            console.error("[target] Error fetching store ID (no response received):", error.message);
        } else {
            console.error("[target] Error fetching store ID:", error.message);
        }
        return null;
    }
}

function formatTargetStoreLocation(storeInfo, fallbackZip) {
    if (!storeInfo) {
        return fallbackZip ? `Target (${fallbackZip})` : "Target Grocery";
    }

    // Return full address if available for better geocoding
    if (storeInfo.fullAddress) {
        return storeInfo.fullAddress;
    }

    const city = storeInfo.address?.city;
    const state = storeInfo.address?.state;
    if (city && state) {
        return `${city}, ${state}`;
    }

    if (fallbackZip) {
        return `Target (${fallbackZip})`;
    }

    return storeInfo.name || "Target Grocery";
}

// Function to fetch products from Target API
async function getTargetProducts(keyword, storeMetadata, zipCode, sortBy = "price") {
    let resolvedStoreInfo = null;
    let storeId = null;

    if (storeMetadata && typeof storeMetadata === "object") {
        resolvedStoreInfo = storeMetadata;
        storeId = storeMetadata.id || storeMetadata.store_id || storeMetadata.storeId;
    } else if (storeMetadata) {
        storeId = storeMetadata;
    }

    // If no store data provided, fetch it first
    if (!storeId) {
        resolvedStoreInfo = await getNearestStore(zipCode);
        storeId = resolvedStoreInfo?.id || resolvedStoreInfo?.store_id;
    }

    if (!storeId) {
        console.warn("[target] No store ID available for Target search");
        return [];
    }

    console.log("[target] Store resolved", { storeId, zipCode, storeName: resolvedStoreInfo?.name, fullAddress: resolvedStoreInfo?.fullAddress });

    const baseUrl = "https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2";
    const params = {
        key: "9f36aeafbe60771e321a7cc95a78140772ab3e96",
        channel: "WEB",
        count: 10,
        default_purchasability_filter: "true",
        include_dmc_dmr: "true",
        include_sponsored: "true",
        include_review_summarization: "false",
        keyword,
        new_search: "true",
        offset: 0,
        page: `/s/${encodeURIComponent(keyword)}`,
        platform: "desktop",
        pricing_store_id: storeId,
        spellcheck: "true",
        store_ids: storeId,
        useragent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        visitor_id: "019669F54C3102019409F15469E30DAF",
        zip: zipCode,
        is_bot: "false",
    };

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
    };

    try {
        const response = await withRetry(async (currentTimeout, attempt) => {
            console.log(`[target] Fetching products for "${keyword}" at store ${storeId} (attempt ${attempt + 1})`);

            // Enforce rate limiting before making request
            await enforceRateLimit();

            return await withTimeout(
                axios.get(baseUrl, {
                    params,
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
            initialTimeout: TARGET_TIMEOUT_MS,
            maxRetries: TARGET_MAX_RETRIES,
            baseDelay: TARGET_RETRY_DELAY_MS,
            retryOn404: false // Don't retry 404s
        });

        // Check response status
        if (response.status === 404) {
            console.error(`[target] API returned 404 for store ${storeId}. The API endpoint or store ID may be invalid.`);
            console.error(`[target] Request URL: ${baseUrl}`);
            console.error(`[target] Store ID: ${storeId}, ZIP: ${zipCode}, Keyword: ${keyword}`);
            return [];
        }

        if (response.status !== 200) {
            console.error(`[target] API returned status ${response.status} for store ${storeId}`);
            console.error(`[target] Response:`, JSON.stringify(response.data).substring(0, 500));
            return [];
        }

        const topLevelKeys = response.data ? Object.keys(response.data) : [];
        const dataKeys = response.data?.data ? Object.keys(response.data.data) : [];
        const searchKeys = response.data?.data?.search ? Object.keys(response.data.data.search) : [];
        console.log("[target] Response shape", {
            status: response.status,
            topLevelKeys,
            dataKeys,
            searchKeys,
            productCount: response.data?.data?.search?.products?.length ?? "missing"
        });

        if (!response.data?.data?.search?.products) {
            console.warn("[target] No products at data.data.search.products — see shape above");
            if (response.data) {
                console.warn("[target] Full response structure:", JSON.stringify(response.data).substring(0, 1000));
            }
            return [];
        }

        const products = response.data.data.search.products;

        if (products.length === 0) {
            console.warn(`[target] No products found for keyword "${keyword}" at store ${storeId}`);
            return [];
        }

        console.log("[target] Raw first product keys", {
            keys: Object.keys(products[0] || {}),
            priceObj: products[0]?.price,
            hasPriceCurrentRetail: "current_retail" in (products[0]?.price || {})
        });

        const locationLabel = formatTargetStoreLocation(resolvedStoreInfo, zipCode);
        const cleanedProducts = products.map(product => {
            const price = product.price?.current_retail || null;
            const pricePerUnit = product.price?.formatted_unit_price || "";
            const title = he.decode(product.item?.product_description?.title || "");
            const productId = product.tcin ? String(product.tcin) : "";

            return {
                product_name: title,
                title,
                brand: product.item?.primary_brand?.name || "",
                price: price,
                pricePerUnit: pricePerUnit,
                unit: product.price?.formatted_unit_price_suffix || "",
                provider: "Target",
                image_url: product.item?.enrichment?.images?.primary_image_url || "",
                category: product.item?.product_classification?.item_type?.name || "",
                product_id: productId || null,
                id: productId,
                target_store_id: String(storeId),
                location: locationLabel,
            };
        });

        const withPrice = cleanedProducts.filter(product => product.price !== null);
        console.log("[target] Filter results", {
            totalMapped: cleanedProducts.length,
            withPrice: withPrice.length,
            withoutPrice: cleanedProducts.length - withPrice.length
        });
        const filteredProducts = withPrice;

        filteredProducts.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        console.log(`[target] Successfully fetched ${filteredProducts.length} products with prices`);
        return filteredProducts;

    } catch (error) {
        if (error.response) {
            console.error(`[target] HTTP error ${error.response.status} fetching products:`, error.message);
            console.error(`[target] Request details: Store ID: ${storeId}, ZIP: ${zipCode}, Keyword: "${keyword}"`);

            // Log response data for debugging
            if (error.response.data) {
                const dataStr = typeof error.response.data === 'string'
                    ? error.response.data
                    : JSON.stringify(error.response.data);
                console.error(`[target] Response excerpt:`, dataStr.substring(0, 500));
            }

            // Special handling for 404
            if (error.response.status === 404) {
                console.error(`[target] ⚠️  404 Error - Possible causes:`);
                console.error(`[target]    1. Target API endpoint has changed`);
                console.error(`[target]    2. Store ID ${storeId} is invalid or no longer active`);
                console.error(`[target]    3. API key may be invalid`);
                console.error(`[target]    Consider checking Target's API documentation or testing with a different store`);
            }
        } else if (error.request) {
            console.error("[target] No response received from Target API:", error.message);
            console.error("[target] Network error or Target servers may be down");
        } else if (error.message?.includes('timeout')) {
            console.error(`[target] Request timed out after ${TARGET_TIMEOUT_MS}ms:`, error.message);
            console.error(`[target] Consider increasing TARGET_TIMEOUT_MS environment variable`);
        } else {
            console.error("[target] Unexpected error fetching products:", error.message);
            console.error("[target] Error type:", error.constructor.name);
        }

        return [];
    }
}

// Main function to execute the script
async function main() {
    const searchTerm = process.argv[2];
    const zipCode = process.argv[3];

    if (!searchTerm || !zipCode) {
        console.error("Usage: node target.js <searchTerm> <zipCode>");
        process.exit(1);
    }

    try {
        const nearestStore = await getNearestStore(zipCode);
        if (!nearestStore) {
            console.error("Could not find a Target store near the provided zip code");
            process.exit(1);
        }

        const data = await getTargetProducts(searchTerm, nearestStore, zipCode);
        console.log(JSON.stringify(data));
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

// Export for use as a module
module.exports = { getTargetProducts };

// Run if called directly
if (require.main === module) {
    main();
}
