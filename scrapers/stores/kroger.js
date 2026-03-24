const axios = require('axios');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { createRateLimiter } = require('../utils/rate-limiter');
const { logHttpErrorToDatabase } = require('../utils/db-error-logger');
const { createResultCache } = require('../utils/result-cache');

const resultCache = createResultCache({ ttlMs: Number(process.env.KROGER_CACHE_TTL_MS || 5 * 60 * 1000) });
require('dotenv').config();
const log = createScraperLogger('kroger');

const { enforceRateLimit } = createRateLimiter({
    requestsPerSecond: Number(process.env.KROGER_REQUESTS_PER_SECOND || 3),
    minIntervalMs: Number(process.env.KROGER_MIN_REQUEST_INTERVAL_MS || 400),
    enableJitter: process.env.KROGER_ENABLE_JITTER !== 'false',
    log,
    label: '[kroger]',
});

const searchTerm = process.argv[2];
const zipCode = process.argv[3];

const CLIENT_ID = process.env.KROGER_CLIENT_ID || "";
const CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET || "";
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 5000);
const KROGER_TOKEN_EXPIRY_SAFETY_MS = Number(process.env.KROGER_TOKEN_EXPIRY_SAFETY_MS || 60 * 1000);
const BROWSER_USER_AGENT = process.env.KROGER_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

let krogerTokenCache = {
    token: null,
    expiresAt: 0,
    inFlightPromise: null,
};

// Helper function to encode Base64
function encodeBase64(clientId, clientSecret) {
    return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

// Utility function to handle timeouts
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

function createKrogerError(code, message, extras = {}) {
    const error = new Error(message);
    error.code = code;
    return Object.assign(error, extras);
}

function sanitizeKrogerAuthError(error) {
    const rawData = error?.response?.data;
    const asText = typeof rawData === "string" ? rawData : String(rawData || error?.message || "");
    const normalized = asText.replace(/\s+/g, " ").trim();
    const accessDenied = /access denied/i.test(normalized);
    const hasReference = normalized.match(/Reference[^<\s]*\s*#?\s*([A-Za-z0-9.]+)/i);
    const summary = accessDenied
        ? `[kroger] Auth blocked by Kroger edge${hasReference ? ` (${hasReference[1]})` : ""}`
        : normalized.slice(0, 220);

    return {
        summary,
        isAccessDenied: accessDenied,
        status: error?.response?.status || null,
    };
}

function getCachedAuthToken() {
    if (!krogerTokenCache.token) {
        return null;
    }

    if (Date.now() >= krogerTokenCache.expiresAt) {
        krogerTokenCache.token = null;
        krogerTokenCache.expiresAt = 0;
        return null;
    }

    return krogerTokenCache.token;
}

function buildKrogerBrowserHeaders(extraHeaders = {}) {
    return {
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.kroger.com",
        "Referer": "https://www.kroger.com/",
        "Priority": "u=1, i",
        "Sec-CH-UA": '"Google Chrome";v="136", "Chromium";v="136", "Not.A/Brand";v="99"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        "User-Agent": BROWSER_USER_AGENT,
        ...extraHeaders,
    };
}

// Function to get the Auth Token
async function getAuthToken() {
    const cachedToken = getCachedAuthToken();
    if (cachedToken) {
        return cachedToken;
    }

    if (krogerTokenCache.inFlightPromise) {
        return krogerTokenCache.inFlightPromise;
    }

    krogerTokenCache.inFlightPromise = (async () => {
    try {
        if (!CLIENT_ID || !CLIENT_SECRET) {
            log.error("[kroger] Missing Kroger API credentials");
            throw createKrogerError("KROGER_AUTH_MISSING_CREDS", "[kroger] Missing Kroger API credentials");
        }

        const requestBody = "grant_type=client_credentials&scope=product.compact";

        await enforceRateLimit();
        const response = await withTimeout(
            axios.post(
                "https://api.kroger.com/v1/connect/oauth2/token",
                requestBody,
                {
                    headers: buildKrogerBrowserHeaders({
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json",
                        "Authorization": "Basic " + encodeBase64(CLIENT_ID, CLIENT_SECRET)
                    })
                }
            ),
            REQUEST_TIMEOUT_MS
        );

        const token = response.data?.access_token;
        if (!token) {
            log.error("[kroger] Auth token response missing access_token");
            throw createKrogerError("KROGER_AUTH_INVALID_RESPONSE", "[kroger] Auth token response missing access_token");
        }

        const expiresInMs = Math.max(0, Number(response.data?.expires_in || 0) * 1000);
        krogerTokenCache.token = token;
        krogerTokenCache.expiresAt = Date.now() + Math.max(0, expiresInMs - KROGER_TOKEN_EXPIRY_SAFETY_MS);

        return token;
    } catch (error) {
        const { summary, isAccessDenied, status } = sanitizeKrogerAuthError(error);
        log.error("[kroger] Error fetching auth token:", summary);
        if (isAccessDenied) {
            throw createKrogerError(
                "KROGER_AUTH_BLOCKED",
                summary,
                { status, retryable: false }
            );
        }
        throw error?.code
            ? error
            : createKrogerError("KROGER_AUTH_FAILED", summary, { status });
    } finally {
        krogerTokenCache.inFlightPromise = null;
    }
    })();

    return krogerTokenCache.inFlightPromise;
}

// Function to resolve nearest store/location by ZIP
async function getNearestStore(zipCode, authToken) {
    try {
        await enforceRateLimit();
        const response = await withTimeout(
            axios.get("https://api.kroger.com/v1/locations", {
                params: {
                    "filter.zipCode.near": zipCode,
                    "filter.limit": 1,
                },
                headers: buildKrogerBrowserHeaders({
                    "Authorization": `Bearer ${authToken}`,
                    "Accept": "application/json",
                })
            }),
            REQUEST_TIMEOUT_MS
        );

        const locations = response.data?.data;
        if (!Array.isArray(locations) || locations.length === 0) {
            log.warn("[kroger] No location found for ZIP:", zipCode);
            return null;
        }

        const storeData = locations[0];
        const address = storeData?.address || {};
        const fullAddress = [
            address.addressLine1,
            address.city,
            address.state,
            address.zipCode,
        ].filter(Boolean).join(", ");

        return {
            locationId: storeData?.locationId || null,
            name: storeData?.name || "Kroger",
            address,
            fullAddress,
            geolocation: storeData?.geolocation || null,
            raw: storeData,
        };
    } catch (error) {
        log.error("[kroger] Error fetching location ID:", error.response?.data || error.message);
        return null;
    }
}

// Function to get products
async function getProducts(searchTerm, locationId, authToken, brand = '') {
    try {
        if (!locationId) {
            log.warn("[kroger] Missing locationId for product lookup");
            return [];
        }

        await enforceRateLimit();
        const response = await withTimeout(
            axios.get(`https://api.kroger.com/v1/products`, {
                params: {
                    "filter.term": searchTerm,
                    "filter.locationId": locationId,
                    ...(brand && { "filter.brand": brand }) // Only include brand if it's provided
                },
                headers: buildKrogerBrowserHeaders({
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                })
            }),
            REQUEST_TIMEOUT_MS
        );

        const products = response.data?.data;
        if (!Array.isArray(products) || products.length === 0) {
            log.warn("[kroger] No products found for search term:", searchTerm);
            return [];
        }

        const normalized = products.map((product) => {
            const candidateItems = Array.isArray(product?.items) ? product.items : [];
            const availableItems = candidateItems.filter(
                (subItem) => subItem.inventory?.stockLevel !== "TEMPORARILY_OUT_OF_STOCK"
            );
            const pricedItem = availableItems.find(
                (subItem) => subItem?.price?.promo != null || subItem?.price?.regular != null
            ) || availableItems[0] || candidateItems[0] || null;

            const price = pricedItem?.price?.promo ?? pricedItem?.price?.regular ?? null;
            const size = pricedItem?.size || "each";
            const numericSize = parseFloat(String(size).split(" ")[0]);
            const pricePerUnit = (price != null && Number.isFinite(numericSize) && numericSize > 0)
                ? (price / numericSize).toFixed(2)
                : null;

            const productName = (product?.description || "").trim();
            const productIdRaw = pricedItem?.itemId || product?.productId || null;
            const productId = productIdRaw != null ? String(productIdRaw) : null;

            const frontImage = Array.isArray(product?.images)
                ? product.images.find((img) => img?.perspective === "front")
                : null;
            const imageUrl =
                frontImage?.sizes?.find((imgSize) => imgSize?.size === "thumbnail")?.url ||
                frontImage?.sizes?.[0]?.url ||
                null;

            return {
                product_name: productName,
                title: productName,
                brand: product?.brand || "",
                description: "",
                category: product?.categories?.[0] || "",
                price,
                unit: size,
                rawUnit: size,
                pricePerUnit,
                image_url: imageUrl,
                product_id: productId,
                id: productId,
                provider: "Kroger",
            };
        });

        const withPrice = normalized.filter(
            (product) =>
                typeof product.price === "number" &&
                Number.isFinite(product.price) &&
                product.price > 0 &&
                product.product_name
        );

        return withPrice;
    } catch (error) {
        log.error("[kroger] Error fetching products:", error.response?.data || error.message);
        if (error.response?.status) {
            await logHttpErrorToDatabase({ storeEnum: 'kroger', storeId: locationId, ingredientName: searchTerm, httpStatus: error.response.status, errorMessage: error.message });
        }
        return [];
    }
}

function formatKrogerStoreLocation(storeInfo, fallbackZip) {
    if (storeInfo?.fullAddress) {
        return storeInfo.fullAddress;
    }

    const city = storeInfo?.address?.city;
    const state = storeInfo?.address?.state;
    if (city && state) {
        return `${city}, ${state}`;
    }

    if (fallbackZip) {
        return `Kroger (${fallbackZip})`;
    }

    return storeInfo?.name || "Kroger Grocery";
}

// Main function to fetch products from Kroger
async function searchKroger(zipCode = 47906, searchTerm, brand = '') {
    const cacheKey = resultCache.buildKey(searchTerm, zipCode);
    return resultCache.runCached(cacheKey, async () => {
        try {
            if (!searchTerm || !String(searchTerm).trim()) {
                log.warn("[kroger] Missing searchTerm");
                return [];
            }

            const token = await getAuthToken();
            if (!token) {
                return [];
            }

            const resolvedStore = await getNearestStore(zipCode, token);
            if (!resolvedStore?.locationId) {
                return [];
            }

            const locationLabel = formatKrogerStoreLocation(resolvedStore, zipCode);
            log.debug("[kroger] Store resolved", {
                locationId: resolvedStore.locationId,
                zipCode,
                storeName: resolvedStore.name,
                fullAddress: resolvedStore.fullAddress,
            });

            return (await getProducts(searchTerm, resolvedStore.locationId, token, brand)).map((product) => ({
                ...product,
                location: locationLabel,
            }));
        } catch (error) {
            if (error?.code === "KROGER_AUTH_BLOCKED" || error?.code === "KROGER_AUTH_MISSING_CREDS") {
                throw error;
            }
            log.error("[kroger] Error in searchKroger function:", error.message || error);
            return [];
        }
    });
}

const Krogers = searchKroger;

// Export for use as a module
module.exports = { searchKroger, Krogers };

// Run if called directly
if (require.main === module) {
  // Call searchKroger and print result
  (async () => {
    try {
      const data = await searchKroger(zipCode, searchTerm);
      console.log(JSON.stringify(data));
    } catch (err) {
      log.error(err);
    }
  })();
}
