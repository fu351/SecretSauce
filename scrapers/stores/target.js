const axios = require('axios');
const he = require('he');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { createRateLimiter } = require('../utils/rate-limiter');
const { logHttpErrorToDatabase } = require('../utils/db-error-logger');
const { createResultCache } = require('../utils/result-cache');
const { withExponentialBackoffRetry } = require('../utils/retry');

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

// Rate limiter
const { enforceRateLimit } = createRateLimiter({
    requestsPerSecond: TARGET_REQUESTS_PER_SECOND,
    minIntervalMs: TARGET_MIN_REQUEST_INTERVAL_MS,
    enableJitter: TARGET_ENABLE_JITTER,
    log,
    label: '[target]',
});

// Store cache to avoid redundant lookups for the same ZIP code
// Maps ZIP code -> store info object
const storeCache = new Map();

const resultCache = createResultCache({ ttlMs: TARGET_CACHE_TTL_MS });


// Utility function to handle timeouts
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

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
        const response = await withExponentialBackoffRetry(async (currentTimeout, attempt) => {
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
            baseDelay: TARGET_RETRY_DELAY_MS,
            onAttempt: ({ attempt, maxRetries, currentTimeout }) => {
                targetDebug(`[target] Attempt ${attempt + 1}/${maxRetries + 1} with timeout ${currentTimeout}ms`);
            },
            getRetryDecision: ({ error, attempt, maxRetries, defaultDelay }) => {
                if (error.response) {
                    const status = error.response.status;
                    if (status >= 400 && status < 500 && status !== 429) {
                        targetDebug(`[target] Client error ${status}, not retrying (attempt ${attempt + 1})`);
                        return { shouldRetry: false };
                    }
                }

                if (attempt === maxRetries) {
                    return { shouldRetry: false };
                }

                targetDebug(`[target] Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${defaultDelay}ms...`);
                return { shouldRetry: true, delayMs: defaultDelay };
            }
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
            store_id: storeId,
            target_store_id: storeId,
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

function resolveTargetStoreId(storeMetadata) {
    if (!storeMetadata || typeof storeMetadata !== "object") {
        return null;
    }

    const explicitStoreId =
        storeMetadata.target_store_id ??
        storeMetadata.targetStoreId ??
        storeMetadata.store_id ??
        storeMetadata.storeId ??
        storeMetadata.raw?.store_id ??
        storeMetadata.raw?.storeId ??
        null;

    if (explicitStoreId === null || explicitStoreId === undefined) {
        return null;
    }

    const normalized = String(explicitStoreId).trim();
    return normalized.length > 0 ? normalized : null;
}

// Function to fetch products from Target API
async function searchTarget(keyword, storeMetadata, zipCode, sortBy = "price") {
    const cacheKey = resultCache.buildKey(keyword, zipCode);

    // Check cache first
    const cachedResult = resultCache.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    // Check if there's already an in-flight request for the same search
    const existingInFlight = resultCache.getInFlight(cacheKey);
    if (existingInFlight) {
        targetDebug(`[target] Waiting for in-flight request: ${cacheKey}`);
        try {
            return await existingInFlight;
        } catch (error) {
            // If the in-flight request failed, we'll retry below
            targetDebug(`[target] In-flight request failed for ${cacheKey}, retrying`);
        }
    }

    // Create a new request promise and store it in the in-flight map
    const requestPromise = (async () => {
        let resolvedStoreInfo = null;
        let storeId = null;
        let storeIdSource = 'explicit'; // Track how store ID was resolved
        try {

            if (storeMetadata && typeof storeMetadata === "object") {
                resolvedStoreInfo = storeMetadata;
                storeId = resolveTargetStoreId(storeMetadata);
                if (storeId) {
                    storeIdSource = 'db_metadata';
                }
                if (!storeId && storeMetadata.id !== undefined && storeMetadata.id !== null) {
                    log.warn(
                        `[target] Ignoring generic metadata.id="${storeMetadata.id}" for "${keyword}" (${zipCode}); ` +
                        `expected target_store_id/store_id to avoid DB-ID collisions`
                    );
                }
            } else if (storeMetadata) {
                storeId = storeMetadata;
                storeIdSource = 'explicit';
            }

            // If no store data provided, fetch it first
            if (!storeId) {
                resolvedStoreInfo = await getNearestStore(zipCode);
                storeId = resolveTargetStoreId(resolvedStoreInfo);
                storeIdSource = 'getNearestStore';
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

            const response = await withExponentialBackoffRetry(async (currentTimeout, attempt) => {
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
                onAttempt: ({ attempt, maxRetries, currentTimeout }) => {
                    targetDebug(`[target] Attempt ${attempt + 1}/${maxRetries + 1} with timeout ${currentTimeout}ms`);
                },
                getRetryDecision: ({ error, attempt, maxRetries, defaultDelay }) => {
                    if (error.response) {
                        const status = error.response.status;
                        if (status === 404) {
                            targetDebug(`[target] Received 404 error, not retrying (attempt ${attempt + 1})`);
                            return { shouldRetry: false };
                        }
                        if (status >= 400 && status < 500 && status !== 429) {
                            targetDebug(`[target] Client error ${status}, not retrying (attempt ${attempt + 1})`);
                            return { shouldRetry: false };
                        }
                    }

                    if (attempt === maxRetries) {
                        return { shouldRetry: false };
                    }

                    targetDebug(`[target] Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${defaultDelay}ms...`);
                    return { shouldRetry: true, delayMs: defaultDelay };
                }
            });

            // Check response status
            if (response.status === 404) {
                // Log to database for analysis
                await logHttpErrorToDatabase({
                    storeEnum: 'target',
                    zipCode,
                    storeId,
                    storeIdSource,
                    ingredientName: keyword,
                    errorMessage: `Target API returned 404 for "${keyword}" at store ${storeId}`,
                    requestUrl: response.config?.url || null,
                });

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
                    rawUnit: product.price?.formatted_unit_price_suffix || "",
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

            const deduplicated = resultCache.dedupe(withPrice, {
                getKey: (product) => product.product_id || product.id,
                onDuplicate: (product, id) => {
                    targetDebug(`[target] Removing duplicate product: ${id} - ${product.title?.substring(0, 50)}`);
                }
            });

            targetDebug("[target] Deduplication", {
                before: withPrice.length,
                after: deduplicated.length,
                removed: withPrice.length - deduplicated.length
            });

            const filteredProducts = deduplicated;
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

    resultCache.setInFlight(cacheKey, requestPromise);

    try {
        const results = await requestPromise;

        if (results && results.length > 0) {
            resultCache.set(cacheKey, results);
        }

        return results;
    } finally {
        resultCache.deleteInFlight(cacheKey);
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

        const data = await searchTarget(searchTerm, nearestStore, zipCode);
        console.log(JSON.stringify(data));
    } catch (err) {
        log.error(err);
        process.exit(1);
    }
}

const getTargetProducts = searchTarget;

// Export for use as a module
module.exports = { searchTarget, getTargetProducts };

// Run if called directly
if (require.main === module) {
    main();
}
