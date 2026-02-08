const axios = require('axios');
const he = require('he');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

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
        const response = await withTimeout(axios.get(baseUrl, { params, headers }), 5000);

        if (!response.data?.data?.nearby_stores?.stores || response.data.data.nearby_stores.stores.length === 0) {
            console.warn("No stores found within 20 miles of zipcode:", zipCode);
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
        console.error("Error fetching store ID:", error.message);
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
        const response = await withTimeout(axios.get(baseUrl, { params, headers }), 5000);

        const topLevelKeys = response.data ? Object.keys(response.data) : [];
        const dataKeys = response.data?.data ? Object.keys(response.data.data) : [];
        const searchKeys = response.data?.data?.search ? Object.keys(response.data.data.search) : [];
        console.log("[target] Response shape", { topLevelKeys, dataKeys, searchKeys, productCount: response.data?.data?.search?.products?.length ?? "missing" });

        if (!response.data?.data?.search?.products) {
            console.warn("[target] No products at data.data.search.products — see shape above");
            return [];
        }

        const products = response.data.data.search.products;
        console.log("[target] Raw first product keys", { keys: Object.keys(products[0] || {}), priceObj: products[0]?.price, hasPriceCurrentRetail: "current_retail" in (products[0]?.price || {}) });

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
                location: locationLabel,
            };
        });

        const withPrice = cleanedProducts.filter(product => product.price !== null);
        console.log("[target] Filter results", { totalMapped: cleanedProducts.length, withPrice: withPrice.length, withoutPrice: cleanedProducts.length - withPrice.length });
        const filteredProducts = withPrice;

        filteredProducts.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        return filteredProducts;
    } catch (error) {
        console.error("Error fetching Target products:", error.message);
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
