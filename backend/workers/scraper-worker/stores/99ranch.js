const axios = require('axios');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { createRateLimiter } = require('../utils/rate-limiter');
const { logHttpErrorToDatabase } = require('../utils/db-error-logger');
const { createResultCache } = require('../utils/result-cache');

const resultCache = createResultCache({ ttlMs: Number(process.env.RANCH99_CACHE_TTL_MS || 5 * 60 * 1000) });
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 5000);
const log = createScraperLogger('99ranch');

const DEFAULT_BATCH_CONCURRENCY = Number(process.env.RANCH99_BATCH_CONCURRENCY || 3);
const MAX_BATCH_CONCURRENCY = 8;

const { enforceRateLimit } = createRateLimiter({
    requestsPerSecond: Number(process.env.RANCH99_REQUESTS_PER_SECOND || 2),
    minIntervalMs: Number(process.env.RANCH99_MIN_REQUEST_INTERVAL_MS || 600),
    enableJitter: process.env.RANCH99_ENABLE_JITTER !== 'false',
    log,
    label: '[99ranch]',
});

// Utility function to handle timeouts
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

async function getNearestStore(zip) {
    try {
        await enforceRateLimit();
        const res = await withTimeout(axios.post(
            "https://www.99ranch.com/be-api/store/web/nearby/stores",
            {
                zipCode: zip,
                pageSize: 1,
                pageNum: 1,
                type: 1,
                source: "WEB",
                within: null
            },
            {
                headers: {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "lang": "en_US",
                    "time-zone": "America/Los_Angeles",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive"
                }
            }
        ), REQUEST_TIMEOUT_MS);

        const stores = res.data?.data?.records || [];
        if (!stores.length) {
            return null;
        }

        const store = stores[0];
        return {
            id: store.id,
            name: store.name,
            fullAddress: store.address,
            street: store.street,
            city: store.city,
            state: store.state,
            zipCode: store.zipCode,
            latitude: store.latitude,
            longitude: store.longitude,
        };
    } catch (error) {
        log.error("Error getting nearest 99 Ranch store:", error.message);
        return null;
    }
}

const buildCache = {
    id: null,
    fetchedAt: 0,
};

async function getBuildId() {
    if (buildCache.id && Date.now() - buildCache.fetchedAt < 1000 * 60 * 60) {
        return buildCache.id;
    }

    try {
        await enforceRateLimit();
        const res = await axios.get("https://www.99ranch.com/en_US", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            },
        });

        const match = typeof res.data === "string" ? res.data.match(/"buildId":"([^"]+)"/) : null;
        if (!match) {
            throw new Error("Unable to extract Next.js build ID");
        }

        buildCache.id = match[1];
        buildCache.fetchedAt = Date.now();
        return buildCache.id;
    } catch (error) {
        log.error("Error fetching 99 Ranch build ID:", error.message);
        throw error;
    }
}

async function searchProducts(store, keyword, zipCode) {
    if (!store?.id) {
        return [];
    }

    const cookie = [`storeid=${store.id}`, `zipcode=${zipCode}`, "deliveryType=1"].join("; ");

    try {
        await enforceRateLimit();
        const res = await withTimeout(
            axios.post(
                "https://www.99ranch.com/be-api/search/web/products",
                {
                    page: 1,
                    pageSize: 28,
                    keyword,
                    availability: 1,
                },
                {
                    headers: {
                        "accept": "application/json",
                        "content-type": "application/json",
                        "storeid": store.id,
                        "deliveryType": "1",
                        "time-zone": "America/Los_Angeles",
                        "lang": "en_US",
                        "origin": "https://www.99ranch.com",
                        "referer": `https://www.99ranch.com/search?keyword=${encodeURIComponent(keyword)}`,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
                        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
                        "Cache-Control": "no-cache",
                        "Pragma": "no-cache",
                        Cookie: cookie,
                    },
                },
            ),
            REQUEST_TIMEOUT_MS,
        );

        return res.data?.data?.list || [];
    } catch (error) {
        log.error("Error searching 99 Ranch products via API:", error.message);
        if (error.response?.status) {
            await logHttpErrorToDatabase({ storeEnum: '99ranch', zipCode, storeId: String(store?.id), ingredientName: keyword, httpStatus: error.response.status, errorMessage: error.message });
        }
        return [];
    }
}

const DEFAULT_99_RANCH_ZIP = process.env.DEFAULT_99_RANCH_ZIP || "94709"

function format99RanchStoreLocation(storeInfo, fallbackZip) {
    if (storeInfo?.fullAddress) {
        return storeInfo.fullAddress;
    }

    const city = storeInfo?.city;
    const state = storeInfo?.state;
    if (city && state) {
        return `${city}, ${state}`;
    }

    if (fallbackZip) {
        return `99 Ranch (${fallbackZip})`;
    }

    return storeInfo?.name || "99 Ranch Market";
}

// 99ranch API appends quantity+unit info directly to product names, e.g.
// "Garlic 1.0000 ea/bag" or "Snow Cabbage 12.0000 oz/each".
// Strip it so the ingredient worker sees "Garlic" not "Garlic 1 0000 ea bag".
function stripRanchQuantitySuffix(name) {
    if (!name) return name;
    return name.replace(/\s+\d+(?:\.\d+)?\s+\w+\/\w+\s*$/i, '').trim();
}

async function search99Ranch(keyword, zipCode) {
    const cacheKey = resultCache.buildKey(keyword, zipCode);
    return resultCache.runCached(cacheKey, async () => {
        try {
            const userZip = (zipCode && zipCode.trim()) || DEFAULT_99_RANCH_ZIP;
            let store = await getNearestStore(userZip);
            if (!store && userZip !== DEFAULT_99_RANCH_ZIP) {
                log.warn(`No 99 Ranch store near ${userZip}, falling back to ${DEFAULT_99_RANCH_ZIP}`);
                store = await getNearestStore(DEFAULT_99_RANCH_ZIP);
            }
            if (!store?.id) {
                log.warn("No nearby 99 Ranch store found for zip code:", zipCode);
                return [];
            }

            const products = await searchProducts(store, keyword, userZip);
            const storeLocation = format99RanchStoreLocation(store, userZip);
            return products
                .map((p) => {
                    const productName = stripRanchQuantitySuffix((p.productName || p.productNameEN || "").trim());
                    const price = Number.parseFloat(String(p.salePrice ?? p.price ?? ""));
                    const productIdRaw = p.productId ?? p.id ?? p.sku ?? p.upc ?? null;
                    const productId = productIdRaw == null ? null : String(productIdRaw);

                    return {
                        product_name: productName,
                        title: productName || "Unknown Product",
                        brand: p.brandName || p.brandNameEN || "",
                        price: Number.isFinite(price) ? price : null,
                        pricePerUnit: p.saleUom || "",
                        unit: p.variantName || p.variantNameEN || "",
                        rawUnit: p.variantName || p.variantNameEN || "",
                        image_url: p.image || p.productImage?.path || "",
                        provider: "99 Ranch",
                        product_id: productId,
                        id: productId,
                        location: storeLocation,
                        category: p.category || "Grocery",
                    };
                })
                .filter((p) => p.price != null && p.price > 0 && p.product_name);
        } catch (error) {
            log.error("Error in 99 Ranch scraper:", error.message);
            return [];
        }
    });
}

async function search99RanchBatch(keywords, zipCode, options = {}) {
    if (!Array.isArray(keywords) || keywords.length === 0) {
        return [];
    }

    const requestedConcurrency = Number(options?.concurrency || DEFAULT_BATCH_CONCURRENCY);
    const concurrency = Math.max(1, Math.min(MAX_BATCH_CONCURRENCY, requestedConcurrency));

    const results = new Array(keywords.length);
    let cursor = 0;
    let fatalError = null;

    async function worker() {
        while (cursor < keywords.length) {
            if (fatalError) {
                return;
            }
            const index = cursor++;
            const keyword = keywords[index];
            try {
                results[index] = await search99Ranch(keyword, zipCode);
            } catch (error) {
                log.error('[99ranch] Batch worker error:', error.message || error);
                results[index] = [];
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    if (fatalError) {
        throw fatalError;
    }
    return results;
}

// Export the function for use in other modules
module.exports = { search99Ranch, search99RanchBatch };

// Run if called directly
if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        log.error("Usage: node 99ranch.js <keyword> <zipCode>");
        process.exit(1);
    }

    search99Ranch(keyword, zipCode).then(results => {
        console.log(JSON.stringify(results));
    }).catch((error) => log.error(error));
}
