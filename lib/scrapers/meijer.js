require('dotenv').config();
const axios = require('axios');
const { createScraperLogger } = require('./logger');
const { withScraperTimeout } = require('./runtime-config');
const log = createScraperLogger('meijer');

const DEFAULT_MEIJER_STORE_ID = Number(process.env.DEFAULT_MEIJER_STORE_ID || 319);

// Utility function to handle timeouts
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

// Function to fetch store locations
async function getLocations(zipCode) {
    try {
        const url = `https://www.meijer.com/bin/meijer/store/search?locationQuery=${zipCode}&radius=20`;

        const config = {
            method: 'get',
            maxBodyLength: Infinity,
            url,
            headers: {
                'accept': 'application/json, text/plain, */*',
                'referer': 'https://www.meijer.com/shopping/store-finder.html',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
            }
        };

        const response = await withTimeout(axios(config), 5000); // Timeout after 5 seconds
        return response.data;
    } catch (error) {
        log.error('Error fetching locations:', error.response?.data || error.message);
        throw new Error('Failed to fetch store locations.');
    }
}

// Function to fetch products from Meijer
async function Meijers(zipCode = 47906, searchTerm) {
    try {
        let storeInfo = null;
        try {
            const locationResponse = await getLocations(zipCode);
            storeInfo = extractNearestStore(locationResponse);
        } catch (locationError) {
            log.warn("Unable to resolve nearest Meijer location:", locationError.message || locationError);
        }

        const storeId = storeInfo?.id || DEFAULT_MEIJER_STORE_ID;
        const storeLocationLabel = formatMeijerStoreLocation(storeInfo, zipCode);

        const response = await withTimeout(
            axios.get(`https://ac.cnstrc.com/search/${encodeURIComponent(searchTerm)}`, {
                params: {
                    "c": "ciojs-client-2.62.4",
                    "key": "key_GdYuTcnduTUtsZd6",
                    "i": "60163d8f-bfab-4c6d-9117-70f5f2d9f534",
                    "s": 4,
                    "us": "web",
                    "page": 1,
                    "num_results_per_page": 52,
                    "filters[availableInStores]": storeId,
                    "sort_by": "relevance",
                    "sort_order": "descending",
                    "fmt_options[groups_max_depth]": 3,
                    "fmt_options[groups_start]": "current",
                    "_dt": Date.now()
                },
                headers: {
                    'accept': '*/*',
                    'accept-language': 'en-US,en;q=0.9',
                    'origin': 'https://www.meijer.com',
                    'priority': 'u=1, i',
                    'referer': 'https://www.meijer.com/',
                    'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'cross-site',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
                }
            }),
            5000
        );

        const Products = response.data.response.results;

        if (!Products || Products.length === 0) {
            log.warn("No products found for search term:", searchTerm);
            return [];
        }

        const normalizedSearchTerm = (searchTerm || "").toString().trim().toLowerCase();

        const filteredProducts = Products.filter(p => {
            const hasMatchedTerms = Array.isArray(p.matched_terms) && p.matched_terms.length > 0;
            if (!hasMatchedTerms) {
                return false;
            }

            if (!normalizedSearchTerm) {
                return true;
            }

            const description = (p.data?.description || "").toLowerCase();
            return description.includes(normalizedSearchTerm);
        });

        if (!filteredProducts.length) {
            log.warn("All products filtered out for search term:", searchTerm);
            return [];
        }

        const details = filteredProducts.map(p => ({
            id: p.data.id,
            name: p.value || null,
            brand: "N/A",
            description: p.data.description || null,
            category: null,
            price: p.data.price || null,
            unit: p.data.productUnit || null,
            pricePerUnit: "N/A",
            image_url: p.data.image_url,
            location: storeLocationLabel,
            provider: "Meijer"
        }));

        const sortedDetails = details
            .filter(item => item.price !== null)
            .sort((a, b) => a.price - b.price)
            .slice(0, 10);

        return sortedDetails;
    } catch (error) {
        log.error("Error fetching products:", error.response?.data || error.message);
        throw new Error("Failed to fetch products from Meijer.");
    }
}

// Example usage: run with `node Meijer.js apples 47906`
if (require.main === module) {
    const [_, __, searchTerm, zip] = process.argv;
    if (!searchTerm || !zip) {
        log.error("Usage: node Meijer.js <searchTerm> <zipCode>");
        process.exit(1);
    }

    Meijers(zip, searchTerm).then(results => {
        console.log(JSON.stringify(results));
    }).catch(err => {
        log.error("❌", err.message);
    });
}

module.exports = { Meijers, getLocations };

function extractNearestStore(locationsResponse) {
    if (!locationsResponse) {
        return null;
    }

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
        if (Array.isArray(collection)) {
            stores = collection;
            break;
        }
        if (Array.isArray(collection?.stores)) {
            stores = collection.stores;
            break;
        }
        if (Array.isArray(collection?.records)) {
            stores = collection.records;
            break;
        }
    }

    if (!stores.length) {
        return null;
    }

    const store = stores[0];
    const address = store?.address || store?.storeAddress || store?.contact?.address || {};

    const line1 = address?.line1 || address?.addressLine1 || "";
    const city = store?.displayName || address?.town || store?.city || address?.city || store?.storeCity || "";
    const state = address?.region?.isocode?.replace("US-", "") || store?.state || address?.state || address?.stateAbbreviation || "";
    const postalCode = address?.postalCode || store?.zipCode || address?.zipCode || "";

    // Build full address string for geocoding
    const fullAddress = [line1, city, state, postalCode].filter(Boolean).join(", ");

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
        name: store?.displayName || store?.storeName || store?.name || "Meijer",
        city,
        state,
        postalCode,
        line1,
        fullAddress,
        geolocation: store?.geoPoint,
    };
}

function formatMeijerStoreLocation(storeInfo, fallbackZip) {
    // Return full address if available for better geocoding
    if (storeInfo?.fullAddress) {
        return storeInfo.fullAddress;
    }
    if (storeInfo?.city && storeInfo?.state) {
        return `${storeInfo.city}, ${storeInfo.state}`;
    }
    if (fallbackZip) {
        return `Meijer (${fallbackZip})`;
    }
    return storeInfo?.name || "Meijer Grocery";
}
