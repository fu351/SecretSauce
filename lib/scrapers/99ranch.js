const axios = require('axios');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

async function getNearestStore(zip) {
    try {
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
        ), 5000);

        const stores = res.data?.data?.records || [];
        return stores.length > 0 ? stores[0].id : null;
    } catch (error) {
        console.error("Error getting nearest 99 Ranch store:", error.message);
        return null;
    }
}

async function searchProducts(storeId, keyword) {
    try {
        const res = await withTimeout(axios.post(
            "https://www.99ranch.com/be-api/search/web/products",
            {
                page: 1,
                pageSize: 10,
                keyword,
                availability: 1,
                sortBy: "salePrice",
                sortOrder: "ASC"
            },
            {
                headers: {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "storeid": storeId,
                    "time-zone": "America/Los_Angeles",
                    "lang": "en_US",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive"
                }
            }
        ), 5000);

        const products = res.data?.data?.products || [];
        
        // Check if products is actually in the 'list' field
        const listProducts = res.data?.data?.list || [];
        
        // Use list instead of products if products is empty
        return listProducts.length > 0 ? listProducts : products;
    } catch (error) {
        console.error("Error searching 99 Ranch products:", error.message);
        return [];
    }
}

async function search99Ranch(keyword, zipCode) {
    try {
        const storeId = await getNearestStore(zipCode);
        if (!storeId) {
            console.warn("No nearby 99 Ranch store found for zip code:", zipCode);
            return [];
        }

        const products = await searchProducts(storeId, keyword);
        const cleaned = products
            .filter(p => p.salePrice && p.salePrice > 0) // Filter out products without prices
            .map(p => ({
                id: p.productId || `99ranch-${Math.random()}`,
                title: p.productName || p.productNameEN || "Unknown Product",
                brand: p.brandName || p.brandNameEN || "",
                price: parseFloat(p.salePrice) || 0,
                pricePerUnit: p.saleUom || "",
                unit: p.variantName || p.variantNameEN || "",
                image_url: p.image || p.productImage?.path || "",
                provider: "99 Ranch",
                location: "99 Ranch Market",
                category: p.category || "Grocery"
            }));

        return cleaned.sort((a, b) => a.price - b.price);
    } catch (error) {
        console.error("Error in 99 Ranch scraper:", error.message);
        return [];
    }
}

// Export the function for use in other modules
module.exports = { search99Ranch };

// Run if called directly
if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        console.error("Usage: node 99ranch.js <keyword> <zipCode>");
        process.exit(1);
    }

    search99Ranch(keyword, zipCode).then(results => {
        console.log(JSON.stringify(results));
    }).catch(console.error);
}
