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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your_openai_api_key_here";

// Function to crawl Trader Joe's search page using Jina AI Reader API
async function crawlTraderJoesWithJina(keyword) {
    try {
        console.log(`Crawling Trader Joe's search page for: ${keyword} using Jina AI`);
        
        // Build Trader Joe's search URL
        const searchUrl = `https://www.traderjoes.com/home/search?q=${encodeURIComponent(keyword)}&section=products&global=yes`;
        const jinaReaderUrl = `https://r.jina.ai/${searchUrl}`;
        
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            // We are NOT setting "X-Retain-Images": "none" to get image URLs
        };

        // Call Jina AI Reader API
        const response = await withTimeout(
            axios.get(jinaReaderUrl, {
                headers: headers,
                timeout: 20000 // 20 second axios timeout
            }),
            25000 // 25 second total timeout
        );

        if (!response.data) {
            console.warn("No content retrieved from Jina AI API");
            return null;
        }

        // Jina returns the clean markdown text directly
        return response.data;
        
    } catch (error) {
        console.error("Error crawling with Jina AI:", error.message);
        return null;
    }
}

// Function to parse products from crawled content using LLM
async function parseProductsWithLLM(crawledContent, keyword) {
    try {
        console.log(`Parsing products with LLM for keyword: ${keyword}`);
        
        const prompt = `
You are a web scraping assistant. Extract the top 5 grocery/food products and their prices from this Trader Joe's search page content.

Search keyword: "${keyword}"

Instructions:
1. Find products that match or are related to "${keyword}"
2. Extract exactly 5 products (or fewer if less available)
3. For each product, extract: title, brand (usually "Trader Joe's"), price, and image URL.
4. The image URL will likely be in markdown format, like \`![alt text](image_url)\`. Extract the URL.
5. Focus on grocery/food items only
6. Return ONLY valid JSON in this exact format:

[
  {
    "title": "Product Name Here",
    "brand": "Brand Name (e.g., Trader Joe's)",
    "price": 4.99,
    "image_url": "https://example.com/image.jpg",
    "id": "unique-identifier"
  }
]

Trader Joe's page content:
${crawledContent.substring(0, 30000)}  // Limit content to stay within token limits

Return only the JSON array, no other text.`;

        const response = await withTimeout(
            axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o-mini",
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
                temperature: 0.1
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
        
        const cleanedResponse = llmResponse
            .replace(/^```json\s*\n?/i, '')
            .replace(/\n?```\s*$/i, '')
            .trim();
        
        const products = JSON.parse(cleanedResponse);
        
        return products
            .filter(product => product.title && product.price && product.price > 0)
            .slice(0, 5)
            .map(product => ({
                id: product.id || `tj-${Math.random().toString(36).substring(7)}`,
                title: product.title,
                brand: product.brand || "Trader Joe's",
                price: parseFloat(product.price),
                pricePerUnit: "",
                unit: "",
                image_url: product.image_url || "/placeholder.svg",
                provider: "Trader Joe's",
                location: "Trader Joe's Store", 
                category: "Grocery"
            }));

    } catch (error) {
        console.error("Error parsing products with LLM:", error.message);
        if (error.response?.data) {
            console.error("LLM Error Response:", error.response.data);
        }
        return [];
    }
}

// Main Trader Joe's search function
async function searchTraderJoes(keyword, zipCode) {
    try {
        // Step 1: Crawl Trader Joe's page
        const crawledContent = await crawlTraderJoesWithJina(keyword);
        
        if (!crawledContent) {
            console.log("Failed to crawl Trader Joe's page, using mock data fallback");
            return generateMockTraderJoesData(keyword);
        }

        // Step 2: Parse products using LLM
        const products = await parseProductsWithLLM(crawledContent, keyword);
        
        if (products.length === 0) {
            console.log("LLM failed to extract products, using mock data fallback");
            return generateMockTraderJoesData(keyword);
        }

        console.log(`Successfully extracted ${products.length} products from Trader Joe's`);
        return products.sort((a, b) => a.price - b.price);

    } catch (error) {
        console.error("Error in Trader Joe's search:", error.message, "- using mock data fallback");
        return generateMockTraderJoesData(keyword);
    }
}

// Function to generate fallback mock data
function generateMockTraderJoesData(keyword) {
    console.log("Generating mock Trader Joe's data as fallback...");
    
    return [
        {
            id: `tj-mock-1-${Date.now()}`,
            title: `Trader Joe's ${keyword}`,
            brand: "Trader Joe's",
            price: 3.99,
            pricePerUnit: "",
            unit: "",
            image_url: "/placeholder.svg",
            provider: "Trader Joe's",
            location: "Trader Joe's Store",
            category: "Grocery"
        },
        {
            id: `tj-mock-2-${Date.now()}`,
            title: `Organic ${keyword}`,
            brand: "Trader Joe's",
            price: 4.99,
            pricePerUnit: "",
            unit: "",
            image_url: "/placeholder.svg",
            provider: "Trader Joe's",
            location: "Trader Joe's Store", 
            category: "Grocery"
        }
    ];
}

// Main function to execute the script
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        console.error("Usage: node traderjoes.js <keyword> <zipCode>");
        console.error("Note: You need OPENAI_API_KEY environment variable");
        process.exit(1);
    }

    if (OPENAI_API_KEY === "your_openai_api_key_here") {
        console.warn("⚠️  Missing OPENAI_API_KEY - using mock data");
        console.warn("Set OPENAI_API_KEY environment variable for real data");
        console.log(JSON.stringify(generateMockTraderJoesData(keyword), null, 2));
        return;
    }

    try {
        console.log(`🔍 Searching Trader Joe's for "${keyword}" using Jina AI + LLM approach...`);
        
        let results = await searchTraderJoes(keyword, zipCode);
        
        if (results.length === 0) {
            console.log("No results from Jina/LLM approach, using mock data...");
            results = generateMockTraderJoesData(keyword);
        }

        console.log(JSON.stringify(results, null, 2));
        
    } catch (err) {
        console.error("Error in main:", err);
        console.log("Using mock data due to error...");
        console.log(JSON.stringify(generateMockTraderJoesData(keyword), null, 2));
    }
}

// Export for use as a module
module.exports = { 
    searchTraderJoes
};

// Run if called directly
if (require.main === module) {
    main();
}