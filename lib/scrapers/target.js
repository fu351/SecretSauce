const axios = require('axios');
const he = require('he');
const { createScraperLogger } = require('./logger');
const { withScraperTimeout } = require('./runtime-config');

// Environment variables for configuration
const TARGET_TIMEOUT_MS = Number(process.env.TARGET_TIMEOUT_MS || 10000);
const TARGET_MAX_RETRIES = Number(process.env.TARGET_MAX_RETRIES || 2);
const TARGET_RETRY_DELAY_MS = Number(process.env.TARGET_RETRY_DELAY_MS || 1000);
const TARGET_CACHE_TTL_MS = Number(process.env.TARGET_CACHE_TTL_MS || 5 * 60 * 1000); // 5 minutes default
const log = createScraperLogger('target');
const TARGET_DEBUG = log.isDebugEnabled;

// Rate limiting configuration
const TARGET_REQUESTS_PER_SECOND = Number(process.env.TARGET_REQUESTS_PER_SECOND || 2);
const TARGET_MIN_REQUEST_INTERVAL_MS = Number(process.env.TARGET_MIN_REQUEST_INTERVAL_MS || 500);
const TARGET_ENABLE_JITTER = process.env.TARGET_ENABLE_JITTER !== 'false'; // Enabled by default

function targetDebug(...args) {
    if (TARGET_DEBUG) log.debug(...args);
}

// Rate limiter state
const rateLimiter = {
    lastRequestTime: 0,
    requestCount: 0,
    windowStart: Date.now(),
    windowDuration: 1000, // 1 second window
};

// Store cache to avoid redundant lookups for the same ZIP code
// Maps ZIP code -> store info object
const storeCache = new Map();

// Result cache to avoid redundant product searches
// Maps cache key (keyword::zipCode) -> { fetchedAt, results }
const targetResultCache = new Map();

// In-flight request tracking to prevent duplicate concurrent requests
// Maps cache key -> Promise
const targetInFlight = new Map();

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
            targetDebug(`[target] Rate limit: ${rateLimiter.requestCount} requests in window, waiting ${waitTime}ms`);
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

        targetDebug(`[target] Rate limit: enforcing ${Math.round(jitter)}ms delay between requests`);
        await new Promise(resolve => setTimeout(resolve, jitter));
    }

    // Update state
    rateLimiter.lastRequestTime = Date.now();
    rateLimiter.requestCount++;
}

// Utility function to handle timeouts
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

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

            targetDebug(`[target] Attempt ${attempt + 1}/${maxRetries + 1} with timeout ${currentTimeout}ms`);

            return await fn(currentTimeout, attempt);
        } catch (error) {
            lastError = error;

            // Check if we should skip retrying based on error type
            if (error.response) {
                const status = error.response.status;

                // Don't retry 404s unless explicitly requested
                if (status === 404 && !retryOn404) {
                    targetDebug(`[target] Received 404 error, not retrying (attempt ${attempt + 1})`);
                    break;
                }

                // Don't retry client errors (400-499) except 429 (rate limit)
                if (status >= 400 && status < 500 && status !== 429) {
                    targetDebug(`[target] Client error ${status}, not retrying (attempt ${attempt + 1})`);
                    break;
                }
            }

            // Don't retry on the last attempt
            if (attempt === maxRetries) {
                break;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

            targetDebug(`[target] Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay}ms...`);

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

// Normalize keyword for consistent cache keys
function normalizeKeyword(keyword) {
    return String(keyword || "").trim().toLowerCase();
}

// Check if product title is relevant to the search keywords
function isRelevantProduct(title, keywords) {
    const normalizedTitle = normalizeKeyword(title || '');
    
    // For single keyword searches, be more lenient (allow singular/plural)
    if (keywords.length === 1) {
        const keyword = keywords[0];
        const keywordBase = keyword.replace(/s$/, ''); // Remove trailing 's' for plural
        
        // Check exact match, singular form, or plural form
        if (normalizedTitle.includes(keyword)) return true;
        if (normalizedTitle.includes(keywordBase)) return true;
        if (normalizedTitle.includes(keywordBase + 's')) return true;
        
        return false;
    }
    
    // For multi-keyword searches, require at least one significant keyword match
    // This filters out completely irrelevant results while allowing related products
    const significantKeywords = keywords.filter(w => w.length > 3); // Focus on meaningful words
    if (significantKeywords.length === 0) return true; // No significant keywords, keep all
    
    // Check if title contains at least one significant keyword (with singular/plural handling)
    // For very specific searches (like "organic eggs"), we want products that match the intent
    const matches = significantKeywords.map(keyword => {
        const keywordBase = keyword.replace(/s$/, '');
        return normalizedTitle.includes(keyword) || 
               normalizedTitle.includes(keywordBase) ||
               normalizedTitle.includes(keywordBase + 's');
    });
    
    // Require at least one match, but prefer matches on more specific/less common words
    // For "organic eggs", "eggs" is more specific than "organic"
    const hasMatch = matches.some(m => m);
    if (!hasMatch) return false;
    
    // If we have multiple keywords and only common words match, be more selective
    // For example, "chicken breast" - if only "chicken" matches but not "breast", it's less relevant
    if (keywords.length >= 2 && matches.filter(m => m).length === 1) {
        // Check if the unmatched keyword is more specific (longer or less common)
        const matchedIndex = matches.findIndex(m => m);
        const matchedKeyword = significantKeywords[matchedIndex];
        const unmatchedKeywords = significantKeywords.filter((_, i) => i !== matchedIndex);
        
        // If unmatched keywords are longer/more specific, the match is less relevant
        const unmatchedMoreSpecific = unmatchedKeywords.some(k => k.length > matchedKeyword.length);
        if (unmatchedMoreSpecific) {
            // Still keep it, but it's a borderline case
            return true;
        }
    }
    
    return true;
}

// Build cache key from keyword and zipCode
function buildCacheKey(keyword, zipCode) {
    return `${normalizeKeyword(keyword)}::${String(zipCode || "").trim()}`;
}

// Get cached result if available and not expired
function getCachedResult(cacheKey) {
    const cached = targetResultCache.get(cacheKey);
    if (!cached) return null;

    // Check if cache entry has expired
    if (Date.now() - cached.fetchedAt > TARGET_CACHE_TTL_MS) {
        targetResultCache.delete(cacheKey);
        targetDebug(`[target] Cache expired for key: ${cacheKey}`);
        return null;
    }

    targetDebug(`[target] Cache hit for key: ${cacheKey} (age: ${Date.now() - cached.fetchedAt}ms)`);
    return cached.results;
}

// Store result in cache
function setCachedResult(cacheKey, results) {
    targetResultCache.set(cacheKey, {
        fetchedAt: Date.now(),
        results,
    });
    targetDebug(`[target] Cached ${results.length} results for key: ${cacheKey}`);
}

async function getNearestStore(zipCode) {
    // Check cache first to avoid redundant API calls
    if (storeCache.has(zipCode)) {
        const cachedStore = storeCache.get(zipCode);
        targetDebug(`[target] Using cached store ${cachedStore.id} for ZIP ${zipCode}`);
        return cachedStore;
    }

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
            targetDebug(`[target] Fetching nearest store for ZIP ${zipCode} (attempt ${attempt + 1})`);

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
            log.warn("[target] No stores found within 20 miles of zipcode:", zipCode);
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

        targetDebug(`[target] Successfully found store ${storeId} for ZIP ${zipCode}`);

        const storeInfo = {
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

        // Cache the result for future requests
        storeCache.set(zipCode, storeInfo);
        targetDebug(`[target] Cached store ${storeId} for ZIP ${zipCode}`);

        return storeInfo;

    } catch (error) {
        if (error.response) {
            log.error(`[target] Error fetching store ID (HTTP ${error.response.status}) for ZIP ${zipCode}: ${error.message}`);
            if (TARGET_DEBUG && error.response.data) {
                log.error(`[target] Store response excerpt:`, JSON.stringify(error.response.data).substring(0, 500));
            }
        } else if (error.request) {
            log.error(`[target] Error fetching store ID (no response) for ZIP ${zipCode}: ${error.message}`);
        } else {
            log.error(`[target] Error fetching store ID for ZIP ${zipCode}: ${error.message}`);
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
    // Build cache key for result caching
    const cacheKey = buildCacheKey(keyword, zipCode);

    // Check cache first
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    // Check if there's already an in-flight request for the same search
    if (targetInFlight.has(cacheKey)) {
        targetDebug(`[target] Waiting for in-flight request: ${cacheKey}`);
        try {
            return await targetInFlight.get(cacheKey);
        } catch (error) {
            // If the in-flight request failed, we'll retry below
            targetDebug(`[target] In-flight request failed for ${cacheKey}, retrying`);
        }
    }

    // Create a new request promise and store it in the in-flight map
    const requestPromise = (async () => {
        try {
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
                log.warn("[target] No store ID available for Target search");
                return [];
            }

            targetDebug("[target] Store resolved", { storeId, zipCode, storeName: resolvedStoreInfo?.name, fullAddress: resolvedStoreInfo?.fullAddress });

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

            const response = await withRetry(async (currentTimeout, attempt) => {
                targetDebug(`[target] Fetching products for "${keyword}" at store ${storeId} (attempt ${attempt + 1})`);

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
                const error = new Error(`[target] API returned 404 for "${keyword}" at store ${storeId} (${zipCode})`);
                error.code = "TARGET_HTTP_404";
                error.status = 404;
                throw error;
            }

            if (response.status !== 200) {
                log.error(`[target] API returned status ${response.status} for "${keyword}" at store ${storeId} (${zipCode})`);
                if (TARGET_DEBUG && response.data) {
                    log.error(`[target] Response excerpt:`, JSON.stringify(response.data).substring(0, 500));
                }
                return [];
            }

            const topLevelKeys = response.data ? Object.keys(response.data) : [];
            const dataKeys = response.data?.data ? Object.keys(response.data.data) : [];
            const searchKeys = response.data?.data?.search ? Object.keys(response.data.data.search) : [];
            targetDebug("[target] Response shape", {
                status: response.status,
                topLevelKeys,
                dataKeys,
                searchKeys,
                productCount: response.data?.data?.search?.products?.length ?? "missing"
            });

            if (!response.data?.data?.search?.products) {
                log.warn(`[target] No products payload for "${keyword}" at store ${storeId} (${zipCode})`);
                if (TARGET_DEBUG && response.data) {
                    log.warn("[target] Full response structure:", JSON.stringify(response.data).substring(0, 1000));
                }
                return [];
            }

            const products = response.data.data.search.products;

            if (products.length === 0) {
                log.warn(`[target] No products found for keyword "${keyword}" at store ${storeId}`);
                return [];
            }

            targetDebug("[target] Raw first product keys", {
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
            targetDebug("[target] Filter results", {
                totalMapped: cleanedProducts.length,
                withPrice: withPrice.length,
                withoutPrice: cleanedProducts.length - withPrice.length
            });

            // Remove duplicates based on product_id
            const seenIds = new Set();
            const deduplicated = withPrice.filter(product => {
                const id = product.product_id || product.id;
                if (!id) return true; // Keep products without IDs (shouldn't happen, but safe)
                if (seenIds.has(id)) {
                    targetDebug(`[target] Removing duplicate product: ${id} - ${product.title?.substring(0, 50)}`);
                    return false;
                }
                seenIds.add(id);
                return true;
            });

            targetDebug("[target] Deduplication", {
                before: withPrice.length,
                after: deduplicated.length,
                removed: withPrice.length - deduplicated.length
            });

            // Filter for relevance: products should be relevant to the search term
            const keywordWords = normalizeKeyword(keyword).split(/\s+/).filter(w => w.length > 2); // Ignore words <= 2 chars
            const relevantProducts = deduplicated.filter(product => {
                const title = product.title || product.product_name || '';
                const isRelevant = isRelevantProduct(title, keywordWords);
                if (!isRelevant) {
                    targetDebug(`[target] Filtering irrelevant product: "${title.substring(0, 60)}"`);
                }
                return isRelevant;
            });

            // If filtering removed too many results (>40%), keep the original results
            // This handles cases where the API returns related but not exact matches
            const relevanceFilterRatio = relevantProducts.length / deduplicated.length;
            const filteredProducts = relevanceFilterRatio >= 0.4 ? relevantProducts : deduplicated;

            if (relevanceFilterRatio < 0.4) {
                targetDebug(`[target] Relevance filter too aggressive (kept ${(relevanceFilterRatio * 100).toFixed(1)}%), using all deduplicated results`);
            } else {
                targetDebug("[target] Relevance filtering", {
                    before: deduplicated.length,
                    after: relevantProducts.length,
                    removed: deduplicated.length - relevantProducts.length
                });
            }

            filteredProducts.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
            targetDebug(`[target] Successfully fetched ${filteredProducts.length} products with prices`);
            return filteredProducts;

        } catch (error) {
            const status = error?.status ?? error?.response?.status;
            if (status === 404 || error?.code === "TARGET_HTTP_404") {
                throw error;
            }

            if (error.response) {
                log.error(`[target] HTTP ${error.response.status} fetching "${keyword}" at store ${storeId} (${zipCode}): ${error.message}`);

                // Log response data for debugging
                if (TARGET_DEBUG && error.response.data) {
                    const dataStr = typeof error.response.data === 'string'
                        ? error.response.data
                        : JSON.stringify(error.response.data);
                    log.error(`[target] Response excerpt:`, dataStr.substring(0, 500));
                }
            } else if (error.request) {
                log.error(`[target] No response from Target API for "${keyword}" at store ${storeId} (${zipCode}): ${error.message}`);
            } else if (error.message?.includes('timeout')) {
                log.error(`[target] Request timed out after ${TARGET_TIMEOUT_MS}ms for "${keyword}" at store ${storeId} (${zipCode}): ${error.message}`);
            } else {
                log.error(`[target] Unexpected error fetching "${keyword}" at store ${storeId} (${zipCode}): ${error.message}`);
            }

            return [];
        }
    })();

    // Store the promise in the in-flight map
    targetInFlight.set(cacheKey, requestPromise);

    try {
        // Wait for the request to complete
        const results = await requestPromise;

        // Cache the results if successful
        if (results && results.length > 0) {
            setCachedResult(cacheKey, results);
        }

        return results;
    } finally {
        // Always clean up the in-flight map
        targetInFlight.delete(cacheKey);
    }
}

// Main function to execute the script
async function main() {
    const searchTerm = process.argv[2];
    const zipCode = process.argv[3];

    if (!searchTerm || !zipCode) {
        log.error("Usage: node target.js <searchTerm> <zipCode>");
        process.exit(1);
    }

    try {
        const nearestStore = await getNearestStore(zipCode);
        if (!nearestStore) {
            log.error("Could not find a Target store near the provided zip code");
            process.exit(1);
        }

        const data = await getTargetProducts(searchTerm, nearestStore, zipCode);
        console.log(JSON.stringify(data));
    } catch (err) {
        log.error(err);
        process.exit(1);
    }
}

// Export for use as a module
module.exports = { getTargetProducts };

// Run if called directly
if (require.main === module) {
    main();
}
