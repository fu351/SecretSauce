const axios = require('axios');
const he = require('he');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

async function getStoreID(zipCode) {
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
        
        return response.data.data.nearby_stores.stores[0].store_id;

    } catch (error) {
        console.error("Error fetching store ID:", error.message);
        return null;
    }
}

// Function to fetch products from Target API
async function getTargetProducts(keyword, store_id, zipCode, sortBy = "price") {
    // If no store_id provided, get it first
    if (!store_id) {
        store_id = await getStoreID(zipCode);
        if (!store_id) {
            console.warn("No store ID available for Target search");
            return [];
        }
    }

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
        pricing_store_id: store_id,
        spellcheck: "true",
        store_ids: store_id,
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

        if (!response.data?.data?.search?.products) {
            console.warn("No products found for the given keyword:", keyword);
            return [];
        }

        const products = response.data.data.search.products;
        const cleanedProducts = products.map(product => {
            const price = product.price?.current_retail || null;
            const pricePerUnit = product.price?.formatted_unit_price || "";

            return {
                title: he.decode(product.item?.product_description?.title || ""),
                brand: product.item?.primary_brand?.name || "",
                price: price,
                pricePerUnit: pricePerUnit,
                unit: product.price?.formatted_unit_price_suffix || "",
                provider: "Target",
                image_url: product.item?.enrichment?.images?.primary_image_url || "",
                category: product.item?.product_classification?.item_type?.name || "",
                id: product.tcin || "",
            };
        }).filter(product => product.price !== null); // Filter out products without prices

        cleanedProducts.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        return cleanedProducts;
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
        const store_id = await getStoreID(zipCode);
        if (!store_id) {
            console.error("Could not find a Target store near the provided zip code");
            process.exit(1);
        }
        
        const data = await getTargetProducts(searchTerm, store_id, zipCode);
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