const axios = require('axios');
const { createScraperLogger } = require('./logger');
const log = createScraperLogger('wholefoods');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

async function searchWholeFoods(keyword, zipCode) {
    const dummyWholeFoodsScraper = async (kw, zip) => {
        log.debug(`[wholefoods] Dummy scraper active. Skipping keyword="${kw}" zip="${zip || ""}"`);
        return [];
    };

    // Temporarily disabled real implementation:
    // return await searchWholeFoodsReal(keyword, zipCode);
    return dummyWholeFoodsScraper(keyword, zipCode);
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
                        id: item.id || `wholefoods-${Math.random()}`,
                        title: item.name || "Unknown Product",
                        brand: item.brand || "",
                        price: parseFloat(item.price) || 0,
                        pricePerUnit: item.price_per_unit || "",
                        unit: item.unit || "",
                        image_url: item.image_url || "",
                        provider: "Whole Foods",
                        location: "Whole Foods Market",
                        category: item.category || "Grocery"
                    }))
                    .filter(p => p.price > 0)
                    .sort((a, b) => a.price - b.price);
            } catch (e) {
                log.error("Failed to parse Whole Foods JSON:", e.message);
            }
        }

        // Alternative: Look for product data in other script patterns
        const productMatches = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s);
        if (productMatches) {
            try {
                const data = JSON.parse(productMatches[1]);
                const products = data.search?.results || data.products || [];
                
                return products
                    .filter(item => item.price && item.price > 0)
                    .map(item => ({
                        id: item.id || `wholefoods-${Math.random()}`,
                        title: item.name || item.title || "Unknown Product",
                        brand: item.brand || "",
                        price: parseFloat(item.price) || 0,
                        pricePerUnit: item.price_per_unit || "",
                        unit: item.unit || "",
                        image_url: item.image_url || item.image || "",
                        provider: "Whole Foods",
                        location: "Whole Foods Market",
                        category: item.category || "Grocery"
                    }))
                    .filter(p => p.price > 0)
                    .sort((a, b) => a.price - b.price);
            } catch (e) {
                log.error("Failed to parse Whole Foods initial state:", e.message);
            }
        }
        
        return [];
    } catch (error) {
        log.error("Error extracting Whole Foods products from HTML:", error.message);
        return [];
    }
}

// Export for use as a module
module.exports = { searchWholeFoods };

// Run if called directly
if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        log.error("Usage: node wholefoods.js <keyword> <zipCode>");
        process.exit(1);
    }

    searchWholeFoods(keyword, zipCode).then(results => {
        console.log(JSON.stringify(results));
    }).catch(err => {
        log.error(err);
        process.exit(1);
    });
}
