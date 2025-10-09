const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

// Environment variables for API keys
const EXA_API_KEY = process.env.EXA_API_KEY || "your_exa_api_key_here";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your_openai_api_key_here";

// Function to crawl Walmart search page using Exa API
async function crawlWalmartWithExa(keyword, zipCode) {
    try {
        console.log(`Crawling Walmart search page for: ${keyword}`);
        
        // Build Walmart search URL
        const walmartSearchUrl = `https://www.walmart.com/search?q=${encodeURIComponent(keyword)}`;
        
        // Call Exa API to crawl the page
        const response = await withTimeout(
            axios.post('https://api.exa.ai/contents', {
                urls: [walmartSearchUrl],
                text: {
                    maxCharacters: 50000,  // Limit content size for cost control
                    includeHtmlTags: false
                },
                livecrawl: "always",  // Always use fresh crawl
                livecrawlTimeout: 15000  // 15 second timeout
            }, {
                headers: {
                    'x-api-key': EXA_API_KEY,
                    'Content-Type': 'application/json'
                }
            }),
            20000  // 20 second total timeout
        );

        if (!response.data || !response.data.results || response.data.results.length === 0) {
            console.warn("No content retrieved from Exa API");
            return null;
        }

        return response.data.results[0].text;
        
    } catch (error) {
        console.error("Error crawling with Exa:", error.message);
        return null;
    }
}

// Function to parse products from crawled content using LLM
async function parseProductsWithLLM(crawledContent, keyword) {
    try {
        console.log(`Parsing products with LLM for keyword: ${keyword}`);
        
        const prompt = `
You are a web scraping assistant. Extract the top 5 grocery/food products and their prices from this Walmart search page content.

Search keyword: "${keyword}"

Instructions:
1. Find products that match or are related to "${keyword}"
2. Extract exactly 5 products (or fewer if less available)
3. For each product, extract: title, brand, price, image URL if visible
4. Focus on grocery/food items only
5. Return ONLY valid JSON in this exact format:

[
  {
    "title": "Product Name Here",
    "brand": "Brand Name (or empty string if none)",
    "price": 4.99,
    "image_url": "image URL if found (or empty string)",
    "id": "unique-identifier"
  }
]

Walmart page content:
${crawledContent.substring(0, 30000)}  // Limit content to stay within token limits

Return only the JSON array, no other text.`;

        const response = await withTimeout(
            axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o-mini",  // Cost-effective model
                messages: [
                    {
                        role: "system",
                        content: "You are a precise web scraping assistant that returns only valid JSON."
                    },
                    {
                        role: "user", 
                        content: prompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.1  // Low temperature for consistent results
            }, {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }),
            15000  // 15 second timeout
        );

        if (!response.data?.choices?.[0]?.message?.content) {
            console.warn("No content returned from LLM");
            return [];
        }

        const llmResponse = response.data.choices[0].message.content.trim();
        
        // Clean LLM response - remove markdown code blocks if present
        const cleanedResponse = llmResponse
            .replace(/^```json\s*\n?/i, '')  // Remove opening ```json
            .replace(/\n?```\s*$/i, '')      // Remove closing ```
            .trim();
        
        // Parse JSON from cleaned LLM response
        const products = JSON.parse(cleanedResponse);
        
        // Validate and format products
        return products
            .filter(product => product.title && product.price && product.price > 0)
            .slice(0, 5)  // Ensure max 5 products
            .map(product => ({
                id: product.id || `walmart-${Math.random()}`,
                title: product.title,
                brand: product.brand || "",
                price: parseFloat(product.price),
                pricePerUnit: "",  // Not available from LLM parsing
                unit: "",
                image_url: product.image_url || "/placeholder.svg",
                provider: "Walmart",
                location: "Walmart Store", 
                category: "Grocery"
            }));

    } catch (error) {
        console.error("Error parsing products with LLM:", error.message);
        return [];
    }
}

// Main Walmart search function using Exa + LLM
async function searchWalmartWithExa(keyword, zipCode) {
    try {
        // Step 1: Crawl Walmart search page
        const crawledContent = await crawlWalmartWithExa(keyword, zipCode);
        
        if (!crawledContent) {
            console.log("Failed to crawl Walmart page, using mock data fallback");
            return generateMockWalmartData(keyword);
        }

        // Step 2: Parse products using LLM
        const products = await parseProductsWithLLM(crawledContent, keyword);
        
        if (products.length === 0) {
            console.log("LLM failed to extract products, using mock data fallback");
            return generateMockWalmartData(keyword);
        }

        console.log(`Successfully extracted ${products.length} products from Walmart`);
        return products.sort((a, b) => a.price - b.price);  // Sort by price

    } catch (error) {
        console.error("Error in Walmart Exa search:", error.message, "- using mock data fallback");
        return generateMockWalmartData(keyword);
    }
}

// Legacy function for backwards compatibility
async function searchWalmartProducts(keyword, zipCode) {
    return await searchWalmartWithExa(keyword, zipCode);
}

// Legacy function for backwards compatibility  
async function searchWalmartAPI(keyword, zipCode) {
    return await searchWalmartWithExa(keyword, zipCode);
}

// Function to generate fallback mock data if APIs fail
function generateMockWalmartData(keyword) {
    console.log("Generating mock Walmart data as fallback...");
    
    return [
        {
            id: `walmart-mock-1-${Date.now()}`,
            title: `Great Value ${keyword}`,
            brand: "Great Value",
            price: 2.98,
            pricePerUnit: "",
            unit: "",
            image_url: "/placeholder.svg",
            provider: "Walmart",
            location: "Walmart Store",
            category: "Grocery"
        },
        {
            id: `walmart-mock-2-${Date.now()}`,
            title: `Fresh ${keyword}`,
            brand: "",
            price: 3.47,
            pricePerUnit: "",
            unit: "",
            image_url: "/placeholder.svg",
            provider: "Walmart",
            location: "Walmart Store", 
            category: "Grocery"
        }
    ];
}

// Main function to execute the script
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        console.error("Usage: node walmart.js <keyword> <zipCode>");
        console.error("Note: You need EXA_API_KEY and OPENAI_API_KEY environment variables");
        process.exit(1);
    }

    // Check for required API keys
    if (EXA_API_KEY === "your_exa_api_key_here" || OPENAI_API_KEY === "your_openai_api_key_here") {
        console.warn("⚠️  Missing API keys - using mock data");
        console.warn("Set EXA_API_KEY and OPENAI_API_KEY environment variables for real data");
        console.log(JSON.stringify(generateMockWalmartData(keyword)));
        return;
    }

    try {
        console.log(`🔍 Searching Walmart for "${keyword}" using Exa + LLM approach...`);
        
        // Use new Exa + LLM approach
        let results = await searchWalmartWithExa(keyword, zipCode);
        
        // Fallback to mock data if no results
        if (results.length === 0) {
            console.log("No results from Exa/LLM approach, using mock data...");
            results = generateMockWalmartData(keyword);
        }

        console.log(JSON.stringify(results));
        
    } catch (err) {
        console.error("Error in main:", err);
        console.log("Using mock data due to error...");
        console.log(JSON.stringify(generateMockWalmartData(keyword)));
    }
}

// Export for use as a module - new primary function
module.exports = { 
    searchWalmartWithExa,           // New primary function
    searchWalmartProducts,          // Legacy compatibility
    searchWalmartAPI               // Legacy compatibility  
};

// Run if called directly
if (require.main === module) {
    main();
}
