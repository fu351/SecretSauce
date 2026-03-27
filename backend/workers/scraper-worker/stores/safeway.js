const playwright = require('playwright-core');
const chromium = require('@sparticuz/chromium');
const path = require('path');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { getOpenAIApiKey, hasConfiguredOpenAIKey, requestOpenAIJson } = require('../utils/jina/llm-fallback');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const log = createScraperLogger('safeway');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

// Environment variables
const OPENAI_API_KEY = getOpenAIApiKey();
// 0 means no cap: return all scraped items.
const SAFEWAY_MAX_RESULTS = Number(process.env.SAFEWAY_MAX_RESULTS || process.env.SCRAPER_MAX_RESULTS || 0);

// Function to fetch RAW data (Text + Images) from Instacart via Playwright
async function fetchRawInstacartData(keyword, zipCode) {
    let browser = null;
    const rawData = [];

    try {
        log.debug(`Fetching raw data for '${keyword}' in ${zipCode} via Playwright...`);

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
                log.debug(`Entering Zip Code: ${zipCode}`);
                await zipInput.fill(zipCode);
                await zipInput.press("Enter");
                await page.waitForLoadState("networkidle");
                await page.waitForTimeout(3000);
            }

            // Handle "Close" button with Strict Mode safety
            // Filter for visible buttons only, then take the first one
            const closeBtn = page.locator("button[aria-label='Close']").filter({ hasText: /.*/, visible: true }).first();
            
            if (await closeBtn.count() > 0) {
                log.debug("Dismissing login modal...");
                await closeBtn.click();
                await page.waitForTimeout(1000);
            }

        } catch (navError) {
            log.warn(`Navigation/Zip warning: ${navError.message}`);
        }

        // 3. Wait for products to load
        try {
            await page.waitForSelector('li', { timeout: 15000 });
            // Extra wait for lazy-loaded images
            await page.waitForTimeout(3000);
        } catch (e) {
            log.warn("Timeout waiting for product list items");
        }

        // 4. Scrape Raw Text and Images
        // We look for list items containing a "$" symbol
        const items = await page.locator('li').filter({ hasText: "$" }).all();
        log.debug(`Found ${items.length} potential item cards.`);

        let count = 0;
        for (const item of items) {
            if (SAFEWAY_MAX_RESULTS > 0 && count >= SAFEWAY_MAX_RESULTS) break;

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
        log.error("Playwright Scraping Error:", error.message);
        return []; 
    } finally {
        if (browser) await browser.close();
    }

    return rawData;
}

// Function to parse products from Playwright raw items using regex (runs before LLM fallback).
// Each rawDataObject has { text: string, img: string } where text is the full inner text
// of an Instacart/Safeway product card (multi-line, messy).
// Typical card text:
//   "Signature SELECT Ice Cream\nAssorted varieties, 48 oz\n$3.99\n$0.08/oz"
function parseRawItemsWithRegex(rawDataObjects) {
    const products = [];

    for (const item of rawDataObjects) {
        const text = String(item.text || "").trim();
        if (!text) continue;

        // Extract the first dollar-sign price (unit price, not per-oz price)
        // We want "$3.99" not "$0.08/oz" — match the largest price to avoid per-unit prices
        const priceMatches = [...text.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)];
        if (priceMatches.length === 0) continue;

        // Pick the largest price value (most likely the item price, not per-unit)
        const price = Math.max(...priceMatches.map(m => parseFloat(m[1])));
        if (!price || price <= 0) continue;

        // Extract pricePerUnit if present (e.g. "$0.83/oz")
        const ppuMatch = text.match(/\$[\d.]+\s*\/\s*([^\n$]{1,20})/);
        const pricePerUnit = ppuMatch ? ppuMatch[0].trim() : "";
        const unit = ppuMatch ? ppuMatch[1].trim() : "";

        // First non-empty, non-price line = product title
        const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
        const titleLine = lines.find(l => !l.startsWith("$") && l.length > 3);
        if (!titleLine) continue;

        products.push({
            id: `sw-${Math.floor(Math.random() * 90000) + 10000}`,
            title: titleLine,
            brand: "Safeway",
            price,
            pricePerUnit,
            unit,
            rawUnit: unit,
            image_url: item.img || "/placeholder.svg",
            provider: "Safeway",
            location: "Safeway Store",
            category: "Grocery"
        });
    }

    return products;
}

// Function to parse products from raw data using LLM
async function parseProductsWithLLM(rawDataObjects, keyword) {
    try {
        log.debug(`Parsing ${rawDataObjects.length} items with LLM...`);

        if (!hasConfiguredOpenAIKey(OPENAI_API_KEY)) {
            log.warn("Missing OPENAI_API_KEY, cannot parse Safeway products with LLM");
            return [];
        }

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

        const parsedProducts = await requestOpenAIJson({
            prompt,
            systemPrompt: "You are a precise JSON extraction API.",
            openAiApiKey: OPENAI_API_KEY,
            maxTokens: 2500,
            temperature: 0.1,
            timeoutMs: 20000,
        });

        if (!Array.isArray(parsedProducts)) {
            log.warn("No content returned from LLM");
            return [];
        }

        return parsedProducts.map(p => ({
            id: `sw-${Math.floor(Math.random() * 90000) + 10000}`,
            title: p.title || "Unknown",
            brand: p.brand || "Safeway",
            price: parseFloat(p.price || 0),
            pricePerUnit: "",
            unit: "",
            rawUnit: "",
            image_url: p.image_url || "/placeholder.svg",
            provider: "Safeway",
            location: "Safeway Store", 
            category: "Grocery"
        }));

    } catch (error) {
        log.error("Error parsing products with LLM:", error.message);
        return [];
    }
}

// Main Safeway search function
async function searchSafeway(keyword, zipCode) {
    const dummySafewayScraper = async (kw, zip) => {
        log.debug(`[safeway] Dummy scraper active. Skipping keyword="${kw}" zip="${zip || ""}"`);
        return [];
    };

    // Temporarily disabled real implementation:
    /*
    const { createRateLimiter } = require('../utils/rate-limiter');
    const { enforceRateLimit } = createRateLimiter({
        requestsPerSecond: Number(process.env.SAFEWAY_REQUESTS_PER_SECOND || 1),
        minIntervalMs: Number(process.env.SAFEWAY_MIN_REQUEST_INTERVAL_MS || 2000),
        enableJitter: process.env.SAFEWAY_ENABLE_JITTER !== 'false',
        log,
        label: '[safeway]',
    });
    try {
        await enforceRateLimit();
        const rawData = await fetchRawInstacartData(keyword, zipCode);
        if (!rawData || rawData.length === 0) {
            log.debug("Failed to fetch raw data via Playwright");
            return [];
        }

        // Step 1: Try regex extraction (fast, no API call)
        const regexProducts = parseRawItemsWithRegex(rawData);
        if (regexProducts.length > 0) {
            log.debug(`Regex extracted ${regexProducts.length} products from Safeway`);
            return regexProducts.sort((a, b) => a.price - b.price);
        }

        // Step 2: Regex found nothing — fall back to LLM
        log.debug("Regex found no products, falling back to LLM");
        const products = await parseProductsWithLLM(rawData, keyword);
        if (products.length === 0) {
            log.debug("LLM failed to parse products");
            return [];
        }

        log.debug(`LLM extracted ${products.length} products from Safeway`);
        return products.sort((a, b) => a.price - b.price);
    } catch (error) {
        log.error("Error in Safeway search:", error.message);
        return [];
    }
    */

    return dummySafewayScraper(keyword, zipCode);
}

// Main execution
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    
    if (!keyword || !zipCode) {
        log.error("Usage: node safeway.js <keyword> <zipCode>");
        log.error("Note: You need OPENAI_API_KEY environment variable");
        process.exit(1);
    }

    try {
        log.debug(`🔍 Safeway dummy scraper active for "${keyword}" in ${zipCode}...`);
        const results = await searchSafeway(keyword, zipCode);
        console.log(JSON.stringify(results, null, 2));
    } catch (err) {
        log.error("Error in main:", err);
        console.log(JSON.stringify([], null, 2));
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
