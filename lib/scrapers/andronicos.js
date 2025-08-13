const axios = require('axios');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

async function searchAndronicos(keyword, zipCode) {
    try {
        console.log(`Searching Andronico's for: ${keyword} in zip: ${zipCode}`);
        
        // Andronico's doesn't have a public API, so we'll return empty results
        console.log("Andronico's doesn't have a public API, returning empty results");
        return [];

    } catch (error) {
        console.error("Error searching Andronico's products:", error.message);
        return [];
    }
}

function extractProductsFromHTML(html) {
    try {
        // Look for product data in script tags
        const scriptMatches = html.match(/<script[^>]*>.*?({.*?"products".*?}).*?<\/script>/s);
        if (scriptMatches) {
            try {
                const data = JSON.parse(scriptMatches[1]);
                const products = data.products || [];
                
                return products
                    .filter(item => item.price && item.price > 0)
                    .map(item => ({
                        id: item.id || `andronicos-${Math.random()}`,
                        title: item.name || "Unknown Product",
                        brand: item.brand || "",
                        price: parseFloat(item.price) || 0,
                        pricePerUnit: item.price_per_unit || "",
                        unit: item.unit || "",
                        image_url: item.image_url || "",
                        provider: "Andronico's",
                        location: "Andronico's Market",
                        category: item.category || "Grocery"
                    }))
                    .filter(p => p.price > 0)
                    .sort((a, b) => a.price - b.price);
            } catch (e) {
                console.error("Failed to parse Andronico's JSON:", e.message);
            }
        }
        
        return [];
    } catch (error) {
        console.error("Error extracting Andronico's products from HTML:", error.message);
        return [];
    }
}

// Export for use as a module
module.exports = { searchAndronicos };

// Run if called directly
if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        console.error("Usage: node andronicos.js <keyword> <zipCode>");
        process.exit(1);
    }

    searchAndronicos(keyword, zipCode).then(results => {
        console.log(JSON.stringify(results));
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
} 