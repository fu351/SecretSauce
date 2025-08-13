const axios = require('axios');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

async function searchWalmartProducts(keyword, zipCode) {
    try {
        console.log(`Searching Walmart for: ${keyword} in zip: ${zipCode}`);
        
        // Since Walmart has strong bot protection and no public API, return empty results
        console.log("Walmart has strong bot protection, returning empty results");
        return [];

    } catch (error) {
        console.error("Error searching Walmart products:", error.message);
        return [];
    }
}

// Alternative method using Walmart's API endpoints (currently blocked)
async function searchWalmartAPI(keyword, zipCode) {
    try {
        const apiUrl = "https://www.walmart.com/api/v3/items/search";
        const params = {
            query: keyword,
            page: 1,
            limit: 20,
            sortBy: "price",
            sortOrder: "asc"
        };

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Referer": "https://www.walmart.com/",
            "Origin": "https://www.walmart.com"
        };

        const response = await withTimeout(axios.get(apiUrl, { params, headers }), 10000);
        
        if (!response.data || !response.data.items) {
            return [];
        }

        return response.data.items
            .filter(item => item.price && item.price.currentPrice)
            .map(item => ({
                id: item.usItemId || `walmart-${Math.random()}`,
                title: item.name || "Unknown Product",
                brand: item.brand || "",
                price: parseFloat(item.price.currentPrice.price) || 0,
                pricePerUnit: item.price.unitPrice || "",
                unit: item.price.unitPriceDisplayText || "",
                image_url: item.imageInfo?.thumbnailUrl || "",
                provider: "Walmart",
                location: "Walmart Store",
                category: item.category || "Grocery"
            }))
            .filter(p => p.price > 0)
            .sort((a, b) => a.price - b.price);

    } catch (error) {
        console.error("Error searching Walmart API:", error.message);
        // Fallback to mock data
        return await searchWalmartProducts(keyword, zipCode);
    }
}

// Main function to execute the script
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        console.error("Usage: node walmart.js <keyword> <zipCode>");
        process.exit(1);
    }

    try {
        // Try API first, fallback to mock data
        let results = await searchWalmartAPI(keyword, zipCode);
        
        if (results.length === 0) {
            console.log("API returned no results, using mock data...");
            results = await searchWalmartProducts(keyword, zipCode);
        }

        console.log(JSON.stringify(results));
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

// Export for use as a module
module.exports = { searchWalmartProducts, searchWalmartAPI };

// Run if called directly
if (require.main === module) {
    main();
} 