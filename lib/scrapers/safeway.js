const playwright = require('playwright-core');
const chromium = require('@sparticuz/chromium');
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

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your_openai_api_key_here";

// Function to fetch RAW data (Text + Images) from Instacart via Playwright
async function fetchRawInstacartData(keyword, zipCode) {
    let browser = null;
    const rawData = [];

    try {
        console.log(`Fetching raw data for '${keyword}' in ${zipCode} via Playwright...`);

        // Launch browser using playwright-core and sparticuz-chromium
        browser = await playwright.chromium.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless, // Use chromium's headless setting for server compatibility
        });
        
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        });

        const page = await context.newPage();

        // 1. Direct Navigation
        await page.goto(`https://www.instacart.com/store/safeway/search/${encodeURIComponent(keyword)}`, {
            timeout: 60000
        });

        // 2. Handle Zip Code / Login Wall
        try {
            const zipInput = page.getByLabel("Zip code");
            if (await zipInput.count() > 0 && await zipInput.isVisible()) {
                console.log(`Entering Zip Code: ${zipCode}`);
                await zipInput.fill(zipCode);
                await zipInput.press("Enter");
                await page.waitForLoadState("networkidle");
                await page.waitForTimeout(3000);
            }

            // Handle "Close" button with Strict Mode safety
            // Filter for visible buttons only, then take the first one
            const closeBtn = page.locator("button[aria-label='Close']").filter({ hasText: /.*/, visible: true }).first();
            
            if (await closeBtn.count() > 0) {
                console.log("Dismissing login modal...");
                await closeBtn.click();
                await page.waitForTimeout(1000);
            }

        } catch (navError) {
            console.warn(`Navigation/Zip warning: ${navError.message}`);
        }

        // 3. Wait for products to load
        try {
            await page.waitForSelector('li', { timeout: 15000 });
            // Extra wait for lazy-loaded images
            await page.waitForTimeout(3000);
        } catch (e) {
            console.warn("Timeout waiting for product list items");
        }

        // 4. Scrape Raw Text and Images
        // We look for list items containing a "$" symbol
        const items = await page.locator('li').filter({ hasText: "$" }).all();
        console.log(`Found ${items.length} potential item cards.`);

        let count = 0;
        for (const item of items) {
            if (count >= 10) break; // Limit to top 10 to save tokens

            const text = (await item.innerText()).trim();
            
            if (text.length > 10 && text.includes("$")) {
                let imgUrl = "";
                try {
                    const imgLocator = item.locator("img").first();
                    if (await imgLocator.count() > 0) {
                        const srcset = await imgLocator.getAttribute("srcset");
                        const src = await imgLocator.getAttribute("src");

                        if (srcset) {
                            // Split by space to get the first URL, remove trailing comma
                            imgUrl = srcset.split(" ")[0].replace(/,$/, '');
                        } else if (src) {
                            imgUrl = src;
                        }
                    }
                } catch (err) {
                    // Ignore image extraction errors
                }

                rawData.push({
                    text: text,
                    img: imgUrl
                });
                count++;
            }
        }

    } catch (error) {
        console.error("Playwright Scraping Error:", error.message);
        return []; 
    } finally {
        if (browser) await browser.close();
    }

    return rawData;
}

// Function to parse products from raw data using LLM
async function parseProductsWithLLM(rawDataObjects, keyword) {
    try {
        console.log(`Parsing ${rawDataObjects.length} items with LLM...`);

        const llmInput = rawDataObjects.map((item, index) => ({
            id: index,
            text_content: item.text,
            img_src: item.img
        }));

        const prompt = `
You are a data structuring assistant. I will provide a JSON list of raw grocery items scraped from Instacart/Safeway.
Each item has an 'id', 'text_content' (messy text), and 'img_src' (the image URL).

Your goal:
1. Extract the Product Title, Price, and Brand from 'text_content'.
2. Keep the 'img_src' exactly as provided and map it to 'image_url'.
3. Keep the 'id' to ensure data integrity.

Keyword: "${keyword}"

Input Data:
${JSON.stringify(llmInput)}

Return ONLY valid JSON in this exact format:
[
  {
    "id": 0,
    "title": "Product Name",
    "brand": "Brand Name",
    "price": 4.99,
    "image_url": "https://..."
  }
]

Rules:
- If price is missing, set it to 0.0.
- Extract numbers only for price.
- Use the exact 'img_src' provided in the input.
`;

        const response = await withTimeout(
            axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a precise JSON extraction API." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 2500,
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }),
            20000 
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
        
        const parsedProducts = JSON.parse(cleanedResponse);

        return parsedProducts.map(p => ({
            id: `sw-${Math.floor(Math.random() * 90000) + 10000}`,
            title: p.title || "Unknown",
            brand: p.brand || "Safeway",
            price: parseFloat(p.price || 0),
            pricePerUnit: "",
            unit: "",
            image_url: p.image_url || "/placeholder.svg",
            provider: "Safeway",
            location: "Safeway Store", 
            category: "Grocery"
        }));

    } catch (error) {
        console.error("Error parsing products with LLM:", error.message);
        return [];
    }
}

// Function to generate fallback mock data
function generateMockSafewayData(keyword) {
    console.log("Generating mock Safeway data as fallback...");
    return [
        {
            id: `sw-mock-1-${Date.now()}`,
            title: `Safeway Select ${keyword}`,
            brand: "Signature Select",
            price: 5.99,
            pricePerUnit: "",
            unit: "",
            image_url: "https://www.instacart.com/assets/domains/product-image/placeholder.jpg",
            provider: "Safeway",
            location: "Safeway Store",
            category: "Grocery"
        },
        {
            id: `sw-mock-2-${Date.now()}`,
            title: `Organic ${keyword}`,
            brand: "O Organics",
            price: 6.99,
            pricePerUnit: "",
            unit: "",
            image_url: "/placeholder.svg",
            provider: "Safeway",
            location: "Safeway Store", 
            category: "Grocery"
        }
    ];
}

// Main Safeway search function
async function searchSafeway(keyword, zipCode) {
    try {
        // Step 1: Fetch Raw Data (Playwright)
        // We now pass the zipCode to the fetcher
        const rawData = await fetchRawInstacartData(keyword, zipCode);

        if (!rawData || rawData.length === 0) {
            console.log("Failed to fetch raw data via Playwright, using mock data");
            return generateMockSafewayData(keyword);
        }

        // Step 2: Parse with LLM
        const products = await parseProductsWithLLM(rawData, keyword);

        if (products.length === 0) {
            console.log("LLM failed to parse products, using mock data");
            return generateMockSafewayData(keyword);
        }

        console.log(`Successfully extracted ${products.length} products from Safeway`);
        return products.sort((a, b) => a.price - b.price);

    } catch (error) {
        console.error("Error in Safeway search:", error.message);
        return generateMockSafewayData(keyword);
    }
}

// Main execution
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    
    if (!keyword || !zipCode) {
        console.error("Usage: node safeway.js <keyword> <zipCode>");
        console.error("Note: You need OPENAI_API_KEY environment variable");
        process.exit(1);
    }

    if (OPENAI_API_KEY === "your_openai_api_key_here") {
        console.warn("⚠️  Missing OPENAI_API_KEY - using mock data");
        console.log(JSON.stringify(generateMockSafewayData(keyword), null, 2));
        return;
    }

    try {
        console.log(`🔍 Searching Safeway for "${keyword}" in ${zipCode}...`);
        const results = await searchSafeway(keyword, zipCode);
        console.log(JSON.stringify(results, null, 2));
    } catch (err) {
        console.error("Error in main:", err);
        console.log(JSON.stringify(generateMockSafewayData(keyword), null, 2));
    }
}

// Export
module.exports = {
    searchSafeway
};

// Run if called directly
if (require.main === module) {
    main();
}