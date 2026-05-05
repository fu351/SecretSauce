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
const SEARCH_RETRY_ATTEMPTS = Number(process.env.RANCH99_SEARCH_RETRIES || 2);
const SEARCH_RETRY_BASE_MS = Number(process.env.RANCH99_SEARCH_RETRY_BASE_MS || 400);

const { enforceRateLimit } = createRateLimiter({
    requestsPerSecond: Number(process.env.RANCH99_REQUESTS_PER_SECOND || 2),
    minIntervalMs: Number(process.env.RANCH99_MIN_REQUEST_INTERVAL_MS || 600),
    enableJitter: process.env.RANCH99_ENABLE_JITTER !== 'false',
    log,
    label: '[99ranch]',
});

// Browser-grade headers. 99 Ranch sits behind Cloudflare; missing sec-ch-* +
// sec-fetch-* headers escalates to bot challenges that surface as opaque
// upstream "TimeOut Error" (code 101002) responses on the search endpoint.
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const BROWSER_HEADERS = {
    'User-Agent': CHROME_UA,
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Chromium";v="135", "Not-A.Brand";v="8", "Google Chrome";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1',
};
const API_HEADERS = {
    ...BROWSER_HEADERS,
    'accept': 'application/json',
    'content-type': 'application/json',
    'lang': 'en_US',
    'time-zone': 'America/Los_Angeles',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'origin': 'https://www.99ranch.com',
};

const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

// Warm-up cookie jar shared across calls in the same process. Cloudflare
// __cf_bm cookies are short-lived (~30 min) which is fine for our cadence.
const cookieJar = {
    cookieHeader: '',
    fetchedAt: 0,
};

function parseSetCookieHeader(setCookieHeader) {
    if (!setCookieHeader) return [];
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    return cookies.map((c) => c.split(';')[0]).filter(Boolean);
}

async function warmCookieJar() {
    if (cookieJar.cookieHeader && Date.now() - cookieJar.fetchedAt < 1000 * 60 * 20) {
        return cookieJar.cookieHeader;
    }
    try {
        await enforceRateLimit();
        const res = await axios.get('https://www.99ranch.com/en_US', {
            headers: BROWSER_HEADERS,
            timeout: REQUEST_TIMEOUT_MS,
            validateStatus: () => true,
        });
        const setCookies = parseSetCookieHeader(res.headers?.['set-cookie']);
        cookieJar.cookieHeader = setCookies.join('; ');
        cookieJar.fetchedAt = Date.now();
        return cookieJar.cookieHeader;
    } catch (error) {
        log.warn('99 Ranch cookie warm-up failed:', error.message);
        return cookieJar.cookieHeader || '';
    }
}

function mergeCookies(...cookieStrings) {
    return cookieStrings.filter(Boolean).join('; ');
}

async function getNearestStore(zip) {
    try {
        await enforceRateLimit();
        const warmCookies = await warmCookieJar();
        const res = await withTimeout(axios.post(
            'https://www.99ranch.com/be-api/store/web/nearby/stores',
            { zipCode: zip, pageSize: 1, pageNum: 1, type: 1, source: 'WEB', within: null },
            {
                headers: {
                    ...API_HEADERS,
                    'referer': 'https://www.99ranch.com/store-locator',
                    ...(warmCookies ? { Cookie: warmCookies } : {}),
                },
                validateStatus: () => true,
            }
        ), REQUEST_TIMEOUT_MS);

        if (res.status !== 200 || res.data?.code !== 0) {
            log.warn(`99 Ranch nearby-stores non-OK: status=${res.status} code=${res.data?.code} message=${res.data?.message}`);
            return null;
        }

        const stores = res.data?.data?.records || [];
        if (!stores.length) return null;

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
        log.error('Error getting nearest 99 Ranch store:', error.message);
        return null;
    }
}

async function searchProductsOnce(store, keyword, zipCode) {
    if (!store?.id) return { ok: false, list: [], reason: 'no_store' };

    const warmCookies = await warmCookieJar();
    const sessionCookies = mergeCookies(
        warmCookies,
        `storeid=${store.id}`,
        `zipcode=${zipCode}`,
        'deliveryType=1'
    );

    await enforceRateLimit();
    const res = await withTimeout(
        axios.post(
            'https://www.99ranch.com/be-api/search/web/products',
            { page: 1, pageSize: 28, keyword, availability: 1 },
            {
                headers: {
                    ...API_HEADERS,
                    'storeid': String(store.id),
                    'deliveryType': '1',
                    'referer': `https://www.99ranch.com/search?keyword=${encodeURIComponent(keyword)}`,
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    Cookie: sessionCookies,
                },
                validateStatus: () => true,
            },
        ),
        REQUEST_TIMEOUT_MS,
    );

    if (res.status !== 200) {
        return { ok: false, list: [], reason: `http_${res.status}`, status: res.status };
    }
    const code = res.data?.code;
    if (code !== 0) {
        return { ok: false, list: [], reason: `api_code_${code}`, message: res.data?.message };
    }
    return { ok: true, list: res.data?.data?.list || [] };
}

async function searchProducts(store, keyword, zipCode) {
    if (!store?.id) return [];
    let lastReason = null;
    for (let attempt = 0; attempt <= SEARCH_RETRY_ATTEMPTS; attempt++) {
        try {
            const result = await searchProductsOnce(store, keyword, zipCode);
            if (result.ok) return result.list;
            lastReason = result;
            // Only retry on the upstream "TimeOut Error" (101002) or 5xx-equivalent.
            const retriable = result.reason === 'api_code_101002' || /^http_5\d\d$/.test(result.reason || '');
            if (!retriable || attempt === SEARCH_RETRY_ATTEMPTS) break;
            // Bust cookie jar between retries in case Cloudflare token went stale.
            cookieJar.fetchedAt = 0;
            const backoff = SEARCH_RETRY_BASE_MS * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, backoff));
        } catch (error) {
            lastReason = { reason: 'exception', message: error.message, status: error.response?.status };
            if (error.response?.status) {
                await logHttpErrorToDatabase({
                    storeEnum: '99ranch', zipCode, storeId: String(store?.id),
                    ingredientName: keyword, httpStatus: error.response.status, errorMessage: error.message,
                });
            }
            if (attempt === SEARCH_RETRY_ATTEMPTS) break;
            const backoff = SEARCH_RETRY_BASE_MS * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, backoff));
        }
    }
    log.error(
        `99 Ranch search failed for keyword="${keyword}" zip=${zipCode} store=${store?.id} after ${SEARCH_RETRY_ATTEMPTS + 1} attempts:`,
        JSON.stringify(lastReason),
    );
    // Throw so the result cache does not memoize an empty result for 5 minutes.
    const err = new Error(`99ranch_search_failed:${lastReason?.reason || 'unknown'}`);
    err.scraperReason = lastReason;
    throw err;
}

const DEFAULT_99_RANCH_ZIP = process.env.DEFAULT_99_RANCH_ZIP || '94709';

function format99RanchStoreLocation(storeInfo, fallbackZip) {
    if (storeInfo?.fullAddress) return storeInfo.fullAddress;
    const city = storeInfo?.city;
    const state = storeInfo?.state;
    if (city && state) return `${city}, ${state}`;
    if (fallbackZip) return `99 Ranch (${fallbackZip})`;
    return storeInfo?.name || '99 Ranch Market';
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
        const userZip = (zipCode && zipCode.trim()) || DEFAULT_99_RANCH_ZIP;
        let searchZip = userZip;
        let store = await getNearestStore(userZip);
        if (!store && userZip !== DEFAULT_99_RANCH_ZIP) {
            log.warn(`No 99 Ranch store near ${userZip}, falling back to ${DEFAULT_99_RANCH_ZIP}`);
            store = await getNearestStore(DEFAULT_99_RANCH_ZIP);
            searchZip = DEFAULT_99_RANCH_ZIP;
        }
        if (!store?.id) {
            log.warn('No nearby 99 Ranch store found for zip code:', zipCode);
            return [];
        }

        let products;
        try {
            products = await searchProducts(store, keyword, searchZip);
        } catch (error) {
            log.error('Error in 99 Ranch scraper:', error.message);
            // Re-throw so result cache does not poison with [].
            throw error;
        }
        const storeLocation = format99RanchStoreLocation(store, searchZip);
        return products
            .map((p) => {
                const productName = stripRanchQuantitySuffix((p.productName || p.productNameEN || '').trim());
                const price = Number.parseFloat(String(p.salePrice ?? p.price ?? ''));
                const productIdRaw = p.productId ?? p.id ?? p.sku ?? p.upc ?? null;
                const productId = productIdRaw == null ? null : String(productIdRaw);

                return {
                    product_name: productName,
                    title: productName || 'Unknown Product',
                    brand: p.brandName || p.brandNameEN || '',
                    price: Number.isFinite(price) ? price : null,
                    pricePerUnit: p.saleUom || '',
                    unit: p.variantName || p.variantNameEN || '',
                    rawUnit: p.variantName || p.variantNameEN || '',
                    image_url: p.image || p.productImage?.path || '',
                    provider: '99 Ranch',
                    product_id: productId,
                    id: productId,
                    location: storeLocation,
                    category: p.category || 'Grocery',
                };
            })
            .filter((p) => p.price != null && p.price > 0 && p.product_name);
    });
}

async function search99RanchBatch(keywords, zipCode, options = {}) {
    if (!Array.isArray(keywords) || keywords.length === 0) return [];

    const requestedConcurrency = Number(options?.concurrency || DEFAULT_BATCH_CONCURRENCY);
    const concurrency = Math.max(1, Math.min(MAX_BATCH_CONCURRENCY, requestedConcurrency));

    const results = new Array(keywords.length);
    let cursor = 0;

    async function worker() {
        while (cursor < keywords.length) {
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
    return results;
}

module.exports = { search99Ranch, search99RanchBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        log.error('Usage: node 99ranch.js <keyword> <zipCode>');
        process.exit(1);
    }

    search99Ranch(keyword, zipCode).then(results => {
        console.log(JSON.stringify(results));
    }).catch((error) => log.error(error));
}
