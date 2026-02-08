const axios = require('axios');
const { createScraperLogger } = require('./logger');
require('dotenv').config();
const log = createScraperLogger('kroger');

const searchTerm = process.argv[2];
const zipCode = process.argv[3];

const CLIENT_ID = process.env.KROGER_CLIENT_ID || "shopsage-243261243034246d665a464b4d485545587677665835526a74466a2f2e704b6d6c4d4e43702f7758624341476a6d497947637268486441527250624f2908504214587086555";
const CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET || "ZoCeBUn1HvoveqtZQA4h1ji4wFh_dpe3uWLynFiO";
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 5000);

// Helper function to encode Base64
function encodeBase64(clientId, clientSecret) {
    return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

// Function to get the Auth Token
async function getAuthToken() {
    try {
        if (!CLIENT_ID || !CLIENT_SECRET) {
            log.error("[kroger] Missing Kroger API credentials");
            return null;
        }

        const requestBody = "grant_type=client_credentials&scope=product.compact";

        const response = await withTimeout(
            axios.post(
                "https://api.kroger.com/v1/connect/oauth2/token",
                requestBody,
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json",
                        "Authorization": "Basic " + encodeBase64(CLIENT_ID, CLIENT_SECRET)
                    }
                }
            ),
            REQUEST_TIMEOUT_MS
        );

        const token = response.data?.access_token;
        if (!token) {
            log.error("[kroger] Auth token response missing access_token");
            return null;
        }

        return token;
    } catch (error) {
        log.error("[kroger] Error fetching auth token:", error.response?.data || error.message);
        return null;
    }
}

// Function to resolve nearest store/location by ZIP
async function getNearestStore(zipCode, authToken) {
    try {
        const response = await withTimeout(
            axios.get("https://api.kroger.com/v1/locations", {
                params: {
                    "filter.zipCode.near": zipCode,
                    "filter.limit": 1,
                },
                headers: {
                    "Authorization": `Bearer ${authToken}`,
                    "Accept": "application/json",
                }
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

        const response = await withTimeout(
            axios.get(`https://api.kroger.com/v1/products`, {
                params: {
                    "filter.term": searchTerm,
                    "filter.locationId": locationId,
                    ...(brand && { "filter.brand": brand }) // Only include brand if it's provided
                },
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
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

        withPrice.sort((a, b) => a.price - b.price);
        return withPrice;
    } catch (error) {
        log.error("[kroger] Error fetching products:", error.response?.data || error.message);
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
async function Krogers(zipCode = 47906, searchTerm, brand = '') {
    try {
        const token = await getAuthToken();
        if (!token) {
            return [];
        }

        if (!searchTerm || !String(searchTerm).trim()) {
            log.warn("[kroger] Missing searchTerm");
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

        const products = await getProducts(searchTerm, resolvedStore.locationId, token, brand);
        return products.map((product) => ({
            ...product,
            location: locationLabel,
        }));
    } catch (error) {
        log.error("[kroger] Error in Krogers function:", error.message || error);
        return [];
    }
}

// Export for use as a module
module.exports = { Krogers };

// Run if called directly
if (require.main === module) {
  // Call Krogers and print result
  (async () => {
    try {
      const data = await Krogers(zipCode, searchTerm);
      console.log(JSON.stringify(data));
    } catch (err) {
      log.error(err);
    }
  })();
}
