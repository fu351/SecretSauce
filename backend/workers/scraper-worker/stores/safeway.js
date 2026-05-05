const playwright = require('playwright-core');
const chromium = require('@sparticuz/chromium');
const path = require('path');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { createRateLimiter } = require('../utils/rate-limiter');
const { getOpenAIApiKey, hasConfiguredOpenAIKey, requestOpenAIJson } = require('../utils/jina/llm-fallback');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const log = createScraperLogger('safeway');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

// Environment variables
const OPENAI_API_KEY = getOpenAIApiKey();
// 0 means no cap: return all scraped items.
const SAFEWAY_MAX_RESULTS = Number(process.env.SAFEWAY_MAX_RESULTS || process.env.SCRAPER_MAX_RESULTS || 0);

// LLM fallback is OFF by default — regex parsing has been the reliable path.
// Set SAFEWAY_LLM_FALLBACK=true to allow LLM extraction when regex finds zero items.
const SAFEWAY_ENABLE_LLM_FALLBACK = process.env.SAFEWAY_LLM_FALLBACK === 'true';

// Hard kill switch for the scraper. Set SAFEWAY_DISABLED=true to short-circuit and
// return [] without launching Playwright (the previous "dummy" mode).
const SAFEWAY_DISABLED = process.env.SAFEWAY_DISABLED === 'true';

const PAGE_NAV_TIMEOUT_MS = Number(process.env.SAFEWAY_PAGE_TIMEOUT_MS || 60000);
const PRODUCT_WAIT_TIMEOUT_MS = Number(process.env.SAFEWAY_PRODUCT_WAIT_MS || 15000);

const { enforceRateLimit } = createRateLimiter({
    requestsPerSecond: Number(process.env.SAFEWAY_REQUESTS_PER_SECOND || 1),
    minIntervalMs: Number(process.env.SAFEWAY_MIN_REQUEST_INTERVAL_MS || 2000),
    enableJitter: process.env.SAFEWAY_ENABLE_JITTER !== 'false',
    log,
    label: '[safeway]',
});

// Function to fetch RAW data (Text + Images) from Instacart via Playwright
async function fetchRawInstacartData(keyword, zipCode) {
    let browser = null;
    const rawData = [];

    try {
        log.debug(`Fetching raw data for '${keyword}' in ${zipCode} via Playwright...`);

        browser = await playwright.chromium.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            locale: 'en-US',
        });

        const page = await context.newPage();

        await page.goto(`https://www.instacart.com/store/safeway/search/${encodeURIComponent(keyword)}`, {
            timeout: PAGE_NAV_TIMEOUT_MS,
            waitUntil: 'domcontentloaded',
        });

        // Handle Zip Code / Login Wall
        try {
            const zipInput = page.getByLabel('Zip code');
            if (await zipInput.count() > 0 && await zipInput.isVisible()) {
                log.debug(`Entering Zip Code: ${zipCode}`);
                await zipInput.fill(zipCode);
                await zipInput.press('Enter');
                await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
                await page.waitForTimeout(3000);
            }

            // Dismiss login modal if present
            const closeBtn = page.locator("button[aria-label='Close']").filter({ visible: true }).first();
            if (await closeBtn.count() > 0) {
                log.debug('Dismissing login modal...');
                await closeBtn.click().catch(() => {});
                await page.waitForTimeout(1000);
            }
        } catch (navError) {
            log.warn(`Navigation/Zip warning: ${navError.message}`);
        }

        // Wait for product cards
        try {
            await page.waitForSelector('li', { timeout: PRODUCT_WAIT_TIMEOUT_MS });
            await page.waitForTimeout(3000); // lazy-loaded images
        } catch {
            log.warn('Timeout waiting for product list items');
        }

        // Scrape Raw Text and Images
        const items = await page.locator('li').filter({ hasText: '$' }).all();
        log.debug(`Found ${items.length} potential item cards.`);

        let count = 0;
        for (const item of items) {
            if (SAFEWAY_MAX_RESULTS > 0 && count >= SAFEWAY_MAX_RESULTS) break;

            const text = (await item.innerText()).trim();
            if (text.length > 10 && text.includes('$')) {
                let imgUrl = '';
                try {
                    const imgLocator = item.locator('img').first();
                    if (await imgLocator.count() > 0) {
                        const srcset = await imgLocator.getAttribute('srcset');
                        const src = await imgLocator.getAttribute('src');
                        if (srcset) imgUrl = srcset.split(' ')[0].replace(/,$/, '');
                        else if (src) imgUrl = src;
                    }
                } catch {
                    // Ignore image extraction errors
                }

                rawData.push({ text, img: imgUrl });
                count++;
            }
        }
    } catch (error) {
        log.error('Playwright Scraping Error:', error.message);
        return [];
    } finally {
        if (browser) await browser.close().catch(() => {});
    }

    return rawData;
}

// Parse products from Playwright raw items using regex (primary path).
// Each rawDataObject has { text, img } where text is the multi-line inner text
// of an Instacart product card. Typical card text:
//   "Signature SELECT Ice Cream\nAssorted varieties, 48 oz\n$3.99\n$0.08/oz"
function parseRawItemsWithRegex(rawDataObjects) {
    const products = [];

    for (const item of rawDataObjects) {
        const text = String(item.text || '').trim();
        if (!text) continue;

        // Largest dollar value = item price (avoids per-unit prices like $0.08/oz)
        const priceMatches = [...text.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)];
        if (priceMatches.length === 0) continue;
        const price = Math.max(...priceMatches.map((m) => parseFloat(m[1])));
        if (!price || price <= 0) continue;

        const ppuMatch = text.match(/\$[\d.]+\s*\/\s*([^\n$]{1,20})/);
        const pricePerUnit = ppuMatch ? ppuMatch[0].trim() : '';
        const unit = ppuMatch ? ppuMatch[1].trim() : '';

        const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
        const titleLine = lines.find((l) => !l.startsWith('$') && l.length > 3);
        if (!titleLine) continue;

        products.push({
            id: `sw-${Math.floor(Math.random() * 90000) + 10000}`,
            title: titleLine,
            brand: 'Safeway',
            price,
            pricePerUnit,
            unit,
            rawUnit: unit,
            image_url: item.img || '/placeholder.svg',
            provider: 'Safeway',
            location: 'Safeway Store',
            category: 'Grocery',
        });
    }

    return products;
}

async function parseProductsWithLLM(rawDataObjects, keyword) {
    try {
        log.debug(`Parsing ${rawDataObjects.length} items with LLM...`);

        if (!hasConfiguredOpenAIKey(OPENAI_API_KEY)) {
            log.warn('Missing OPENAI_API_KEY, cannot parse Safeway products with LLM');
            return [];
        }

        const llmInput = rawDataObjects.map((item, index) => ({
            id: index,
            text_content: item.text,
            img_src: item.img,
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
            systemPrompt: 'You are a precise JSON extraction API.',
            openAiApiKey: OPENAI_API_KEY,
            maxTokens: 2500,
            temperature: 0.1,
            timeoutMs: 20000,
        });

        if (!Array.isArray(parsedProducts)) {
            log.warn('No content returned from LLM');
            return [];
        }

        return parsedProducts.map((p) => ({
            id: `sw-${Math.floor(Math.random() * 90000) + 10000}`,
            title: p.title || 'Unknown',
            brand: p.brand || 'Safeway',
            price: parseFloat(p.price || 0),
            pricePerUnit: '',
            unit: '',
            rawUnit: '',
            image_url: p.image_url || '/placeholder.svg',
            provider: 'Safeway',
            location: 'Safeway Store',
            category: 'Grocery',
        }));
    } catch (error) {
        log.error('Error parsing products with LLM:', error.message);
        return [];
    }
}

async function searchSafeway(keyword, zipCode) {
    if (SAFEWAY_DISABLED) {
        log.debug(`[safeway] SAFEWAY_DISABLED=true, skipping keyword="${keyword}" zip="${zipCode || ''}"`);
        return [];
    }

    try {
        await enforceRateLimit();
        const rawData = await fetchRawInstacartData(keyword, zipCode);
        if (!rawData || rawData.length === 0) {
            log.warn(`Safeway: no raw data for "${keyword}" in ${zipCode} (Instacart returned no cards)`);
            return [];
        }

        // Step 1: regex extraction (fast, free, primary path)
        const regexProducts = parseRawItemsWithRegex(rawData);
        if (regexProducts.length > 0) {
            log.debug(`Regex extracted ${regexProducts.length} products from Safeway`);
            return regexProducts.sort((a, b) => a.price - b.price);
        }

        // Step 2: optional LLM fallback (gated by env flag)
        if (!SAFEWAY_ENABLE_LLM_FALLBACK) {
            log.warn(`Safeway: regex found 0 products and LLM fallback disabled (set SAFEWAY_LLM_FALLBACK=true to enable). Raw card sample: ${JSON.stringify(rawData[0]?.text?.slice(0, 200))}`);
            return [];
        }

        log.debug('Regex found no products, falling back to LLM');
        const products = await parseProductsWithLLM(rawData, keyword);
        if (products.length === 0) {
            log.warn('LLM failed to parse products');
            return [];
        }

        log.debug(`LLM extracted ${products.length} products from Safeway`);
        return products.sort((a, b) => a.price - b.price);
    } catch (error) {
        log.error('Error in Safeway search:', error.message);
        return [];
    }
}

async function searchSafewayBatch(keywords, zipCode, options = {}) {
    if (!Array.isArray(keywords) || keywords.length === 0) return [];

    // Playwright is heavy — keep concurrency low.
    const requested = Number(options?.concurrency || process.env.SAFEWAY_BATCH_CONCURRENCY || 1);
    const concurrency = Math.max(1, Math.min(2, requested));

    const results = new Array(keywords.length);
    let cursor = 0;

    async function worker() {
        while (cursor < keywords.length) {
            const index = cursor++;
            const keyword = keywords[index];
            try {
                results[index] = await searchSafeway(keyword, zipCode);
            } catch (error) {
                log.error('[safeway] Batch worker error:', error.message || error);
                results[index] = [];
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
}

// Main execution
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        log.error('Usage: node safeway.js <keyword> <zipCode>');
        process.exit(1);
    }

    try {
        log.debug(`Safeway scraper running for "${keyword}" in ${zipCode}...`);
        const results = await searchSafeway(keyword, zipCode);
        console.log(JSON.stringify(results, null, 2));
    } catch (err) {
        log.error('Error in main:', err);
        console.log(JSON.stringify([], null, 2));
    }
}

module.exports = {
    searchSafeway,
    searchSafewayBatch,
};

if (require.main === module) {
    main();
}
