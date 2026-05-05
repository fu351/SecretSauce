require('dotenv').config();
const axios = require('axios');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { createRateLimiter } = require('../utils/rate-limiter');
const { logHttpErrorToDatabase } = require('../utils/db-error-logger');
const { createResultCache } = require('../utils/result-cache');

const resultCache = createResultCache({ ttlMs: Number(process.env.MEIJER_CACHE_TTL_MS || 5 * 60 * 1000) });
const log = createScraperLogger('meijer');

const DEFAULT_BATCH_CONCURRENCY = Number(process.env.MEIJER_BATCH_CONCURRENCY || 3);
const MAX_BATCH_CONCURRENCY = 8;

const { enforceRateLimit } = createRateLimiter({
    requestsPerSecond: Number(process.env.MEIJER_REQUESTS_PER_SECOND || 2),
    minIntervalMs: Number(process.env.MEIJER_MIN_REQUEST_INTERVAL_MS || 500),
    enableJitter: process.env.MEIJER_ENABLE_JITTER !== 'false',
    log,
    label: '[meijer]',
});

const DEFAULT_MEIJER_STORE_ID = Number(process.env.DEFAULT_MEIJER_STORE_ID || 319);

const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

// Browser fingerprint headers shared across calls to meijer.com — without
// them the store-finder regularly returns 403 from datacenter IPs.
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const BROWSER_HEADERS = {
    'user-agent': CHROME_UA,
    'accept-language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
};

// Per-zip store ID cache. The store-finder is the slow / fragile path; reuse
// resolved IDs aggressively to avoid hitting it.
const storeIdCache = new Map();

async function getLocations(zipCode) {
    try {
        const url = `https://www.meijer.com/bin/meijer/store/search?locationQuery=${encodeURIComponent(zipCode)}&radius=20`;
        const config = {
            method: 'get',
            maxBodyLength: Infinity,
            url,
            headers: {
                ...BROWSER_HEADERS,
                'accept': 'application/json, text/plain, */*',
                'referer': 'https://www.meijer.com/shopping/store-finder.html',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
            },
            validateStatus: () => true,
        };

        await enforceRateLimit();
        const response = await withTimeout(axios(config), 5000);
        if (response.status !== 200) {
            log.warn(`Meijer store-finder non-OK: status=${response.status} zip=${zipCode}`);
            return null;
        }
        return response.data;
    } catch (error) {
        log.warn('Error fetching Meijer locations:', error.response?.status || error.message);
        return null;
    }
}

async function resolveStoreId(zipCode) {
    if (zipCode == null) return DEFAULT_MEIJER_STORE_ID;
    const cached = storeIdCache.get(String(zipCode));
    if (cached) return cached;

    const locations = await getLocations(zipCode);
    const storeInfo = extractNearestStore(locations);
    const storeId = storeInfo?.id || DEFAULT_MEIJER_STORE_ID;
    storeIdCache.set(String(zipCode), { id: storeId, info: storeInfo });
    return { id: storeId, info: storeInfo };
}

async function searchMeijer(zipCode = 47906, searchTerm) {
    const cacheKey = resultCache.buildKey(searchTerm, zipCode);
    return resultCache.runCached(cacheKey, () => searchMeijerUncached(zipCode, searchTerm));
}

async function searchMeijerUncached(zipCode, searchTerm) {
    let storeId = DEFAULT_MEIJER_STORE_ID;
    let storeInfo = null;
    try {
        const resolved = await resolveStoreId(zipCode);
        storeId = (typeof resolved === 'object' ? resolved.id : resolved) || DEFAULT_MEIJER_STORE_ID;
        storeInfo = typeof resolved === 'object' ? resolved.info : null;
        const storeLocationLabel = formatMeijerStoreLocation(storeInfo, zipCode);

        await enforceRateLimit();
        const response = await withTimeout(
            axios.get(`https://ac.cnstrc.com/search/${encodeURIComponent(searchTerm)}`, {
                params: {
                    'c': 'ciojs-client-2.62.4',
                    'key': 'key_GdYuTcnduTUtsZd6',
                    'i': '60163d8f-bfab-4c6d-9117-70f5f2d9f534',
                    's': 4,
                    'us': 'web',
                    'page': 1,
                    'num_results_per_page': 52,
                    'filters[availableInStores]': storeId,
                    'sort_by': 'relevance',
                    'sort_order': 'descending',
                    'fmt_options[groups_max_depth]': 3,
                    'fmt_options[groups_start]': 'current',
                    '_dt': Date.now(),
                },
                headers: {
                    ...BROWSER_HEADERS,
                    'accept': '*/*',
                    'origin': 'https://www.meijer.com',
                    'priority': 'u=1, i',
                    'referer': 'https://www.meijer.com/',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'cross-site',
                },
                validateStatus: () => true,
            }),
            5000,
        );

        if (response.status !== 200) {
            log.warn(`Meijer search non-OK: status=${response.status} term=${searchTerm}`);
            await logHttpErrorToDatabase({ storeEnum: 'meijer', zipCode, storeId: String(storeId), ingredientName: searchTerm, httpStatus: response.status, errorMessage: `non-200 status` });
            return [];
        }

        const Products = response.data?.response?.results || [];
        if (!Products.length) {
            log.warn('No products found for search term:', searchTerm);
            return [];
        }

        const normalizedSearchTerm = (searchTerm || '').toString().trim().toLowerCase();
        const filteredProducts = Products.filter((p) => {
            const hasMatchedTerms = Array.isArray(p.matched_terms) && p.matched_terms.length > 0;
            if (!hasMatchedTerms) return false;
            if (!normalizedSearchTerm) return true;
            const description = (p.data?.description || '').toLowerCase();
            const value = (p.value || '').toLowerCase();
            return description.includes(normalizedSearchTerm) || value.includes(normalizedSearchTerm);
        });

        if (!filteredProducts.length) {
            log.warn('All products filtered out for search term:', searchTerm);
            return [];
        }

        const details = filteredProducts.map((p) => ({
            id: p.data?.id || `meijer-${Math.random().toString(36).slice(2, 9)}`,
            product_id: p.data?.id || null,
            name: p.value || null,
            title: p.value || null,
            product_name: p.value || null,
            brand: p.data?.brand || extractBrandFromName(p.value) || 'Meijer',
            description: p.data?.description || null,
            category: p.data?.category || null,
            price: typeof p.data?.price === 'number' ? p.data.price : Number.parseFloat(p.data?.price) || null,
            unit: p.data?.productUnit || null,
            rawUnit: p.data?.productUnit || null,
            pricePerUnit: p.data?.pricePerUnit || p.data?.unitPrice || '',
            image_url: p.data?.image_url || '',
            location: storeLocationLabel,
            provider: 'Meijer',
        }));

        return details.filter((item) => item.price !== null && item.price > 0);
    } catch (error) {
        log.error('Error fetching products:', error.response?.data || error.message);
        if (error.response?.status) {
            await logHttpErrorToDatabase({ storeEnum: 'meijer', zipCode, storeId: String(storeId), ingredientName: searchTerm, httpStatus: error.response.status, errorMessage: error.message });
        }
        return [];
    }
}

// Conservative brand-from-name extraction. Constructor.io's results often
// don't include a brand field; the product name typically starts with the
// brand (e.g. "Meijer Garlic Powder", "Frontier Co-op Crushed Red Pepper").
// Extract the first 1-3 words if they look like a brand, else null.
function extractBrandFromName(name) {
    if (!name) return null;
    const trimmed = String(name).trim();
    // Single-word brand: first word if capitalized.
    const m = trimmed.match(/^([A-Z][\w'.&-]+(?:\s+(?:Co-op|Co\.|& Co\.|de la Tierra|Naturals|Foods|Brand))?)/);
    return m ? m[1] : null;
}

if (require.main === module) {
    const [_, __, searchTerm, zip] = process.argv;
    if (!searchTerm || !zip) {
        log.error('Usage: node meijer.js <searchTerm> <zipCode>');
        process.exit(1);
    }

    searchMeijer(zip, searchTerm).then((results) => {
        console.log(JSON.stringify(results));
    }).catch((err) => {
        log.error('❌', err.message);
    });
}

const Meijers = searchMeijer;

async function searchMeijerBatch(keywords, zipCode, options = {}) {
    if (!Array.isArray(keywords) || keywords.length === 0) return [];

    const requestedConcurrency = Number(options?.concurrency || DEFAULT_BATCH_CONCURRENCY);
    const concurrency = Math.max(1, Math.min(MAX_BATCH_CONCURRENCY, requestedConcurrency));

    const results = new Array(keywords.length);
    let cursor = 0;

    async function worker() {
        while (cursor < keywords.length) {
            const index = cursor++;
            try {
                results[index] = await searchMeijer(zipCode, keywords[index]);
            } catch (error) {
                log.error('[meijer] Batch worker error:', error.message || error);
                results[index] = [];
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
}

module.exports = { searchMeijer, Meijers, getLocations, searchMeijerBatch };

function extractNearestStore(locationsResponse) {
    if (!locationsResponse) return null;

    const possibleCollections = [
        locationsResponse?.pointsOfService,
        locationsResponse,
        locationsResponse?.data,
        locationsResponse?.data?.records,
        locationsResponse?.stores,
        locationsResponse?.results,
        locationsResponse?.storeLocator,
    ];

    let stores = [];
    for (const collection of possibleCollections) {
        if (Array.isArray(collection)) { stores = collection; break; }
        if (Array.isArray(collection?.stores)) { stores = collection.stores; break; }
        if (Array.isArray(collection?.records)) { stores = collection.records; break; }
    }

    if (!stores.length) return null;

    const store = stores[0];
    const address = store?.address || store?.storeAddress || store?.contact?.address || {};
    const line1 = address?.line1 || address?.addressLine1 || '';
    const city = store?.displayName || address?.town || store?.city || address?.city || store?.storeCity || '';
    const state = address?.region?.isocode?.replace('US-', '') || store?.state || address?.state || address?.stateAbbreviation || '';
    const postalCode = address?.postalCode || store?.zipCode || address?.zipCode || '';
    const fullAddress = [line1, city, state, postalCode].filter(Boolean).join(', ');

    return {
        id:
            store?.name ||
            store?.mfcStoreId ||
            store?.storeNumber ||
            store?.storeId ||
            store?.id ||
            store?.locationId ||
            store?.locationNumber ||
            store?.store?.storeNumber,
        name: store?.displayName || store?.storeName || store?.name || 'Meijer',
        city,
        state,
        postalCode,
        line1,
        fullAddress,
        geolocation: store?.geoPoint,
    };
}

function formatMeijerStoreLocation(storeInfo, fallbackZip) {
    if (storeInfo?.fullAddress) return storeInfo.fullAddress;
    if (storeInfo?.city && storeInfo?.state) return `${storeInfo.city}, ${storeInfo.state}`;
    if (fallbackZip) return `Meijer (${fallbackZip})`;
    return storeInfo?.name || 'Meijer Grocery';
}
