const playwright = require('playwright-core');
const chromium = require('@sparticuz/chromium');
const path = require('path');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { createRateLimiter } = require('../utils/rate-limiter');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const log = createScraperLogger('aldi');
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

// Hard kill switch.
const ALDI_DISABLED = process.env.ALDI_DISABLED === 'true';

const ALDI_MAX_RESULTS = Number(process.env.ALDI_MAX_RESULTS || process.env.SCRAPER_MAX_RESULTS || 0);
const PAGE_NAV_TIMEOUT_MS = Number(process.env.ALDI_PAGE_TIMEOUT_MS || 60000);
const PRODUCT_WAIT_TIMEOUT_MS = Number(process.env.ALDI_PRODUCT_WAIT_MS || 15000);

const { enforceRateLimit } = createRateLimiter({
    requestsPerSecond: Number(process.env.ALDI_REQUESTS_PER_SECOND || 1),
    minIntervalMs: Number(process.env.ALDI_MIN_REQUEST_INTERVAL_MS || 2000),
    enableJitter: process.env.ALDI_ENABLE_JITTER !== 'false',
    log,
    label: '[aldi]',
});

// As of 2026, aldi.us migrated its e-commerce to Instacart's white-label
// platform. Both `aldi.us/store/aldi/...` and `instacart.com/store/aldi/...`
// resolve to the same Instacart storefront, with /results and /search on the
// legacy aldi.us paths returning 404. The previous Jina-based crawler was
// hitting a dead URL. We now use the Instacart storefront the same way the
// Safeway scraper does.
async function fetchRawInstacartAldiData(keyword, zipCode) {
    let browser = null;
    const rawData = [];

    try {
        log.debug(`Fetching Aldi data for '${keyword}' zip=${zipCode || 'none'}...`);

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

        await page.goto(`https://www.instacart.com/store/aldi/search/${encodeURIComponent(keyword)}`, {
            timeout: PAGE_NAV_TIMEOUT_MS,
            waitUntil: 'domcontentloaded',
        });

        // Zip wall / login modal handling (same pattern as Safeway).
        try {
            const zipInput = page.getByLabel('Zip code');
            if (zipCode && (await zipInput.count()) > 0 && await zipInput.isVisible()) {
                await zipInput.fill(zipCode);
                await zipInput.press('Enter');
                await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
                await page.waitForTimeout(3000);
            }
            const closeBtn = page.locator("button[aria-label='Close']").filter({ visible: true }).first();
            if (await closeBtn.count() > 0) await closeBtn.click().catch(() => {});
            await page.waitForTimeout(1000);
        } catch (navErr) {
            log.warn(`Aldi: navigation/zip warning: ${navErr.message}`);
        }

        try {
            await page.waitForSelector('li', { timeout: PRODUCT_WAIT_TIMEOUT_MS });
            await page.waitForTimeout(2500);
        } catch {
            log.warn('Aldi: timeout waiting for product list items');
        }

        const items = await page.locator('li').filter({ hasText: '$' }).all();
        log.debug(`Aldi: found ${items.length} item cards`);

        let count = 0;
        for (const item of items) {
            if (ALDI_MAX_RESULTS > 0 && count >= ALDI_MAX_RESULTS) break;
            try {
                const text = (await item.innerText()).trim();
                if (text.length < 10 || !text.includes('$')) continue;

                let imgUrl = '';
                try {
                    const img = item.locator('img').first();
                    if (await img.count() > 0) {
                        const srcset = await img.getAttribute('srcset');
                        const src = await img.getAttribute('src');
                        if (srcset) imgUrl = srcset.split(' ')[0].replace(/,$/, '');
                        else if (src) imgUrl = src;
                    }
                } catch {}
                rawData.push({ text, img: imgUrl });
                count++;
            } catch (cardErr) {
                log.debug('Aldi card scrape error:', cardErr.message);
            }
        }
    } catch (error) {
        log.error('Aldi Playwright error:', error.message);
        return [];
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
    return rawData;
}

function parseRawItemsWithRegex(rawDataObjects) {
    const products = [];
    for (const item of rawDataObjects) {
        const text = String(item.text || '').trim();
        if (!text) continue;
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
            id: `aldi-${Math.floor(Math.random() * 90000) + 10000}`,
            title: titleLine,
            brand: 'ALDI',
            price,
            pricePerUnit,
            unit,
            rawUnit: unit,
            image_url: item.img || '/placeholder.svg',
            provider: 'Aldi',
            location: 'Aldi Grocery',
            category: 'Grocery',
        });
    }
    return products;
}

async function searchAldi(keyword, zipCode) {
    if (ALDI_DISABLED) {
        log.debug(`[aldi] ALDI_DISABLED=true, skipping keyword="${keyword}"`);
        return [];
    }

    try {
        await enforceRateLimit();
        const rawData = await fetchRawInstacartAldiData(keyword, zipCode);
        if (!rawData.length) {
            log.warn(`Aldi: 0 raw cards for "${keyword}" in ${zipCode}`);
            return [];
        }
        const products = parseRawItemsWithRegex(rawData);
        if (products.length === 0) {
            log.warn(`Aldi: regex parsed 0 products from ${rawData.length} cards. Sample: ${JSON.stringify(rawData[0]?.text?.slice(0, 200))}`);
            return [];
        }
        log.debug(`Aldi: extracted ${products.length} products`);
        return products.sort((a, b) => a.price - b.price);
    } catch (error) {
        log.error('Error in Aldi search:', error.message);
        return [];
    }
}

async function searchAldiBatch(keywords, zipCode, options = {}) {
    if (!Array.isArray(keywords) || keywords.length === 0) return [];
    const requested = Number(options?.concurrency || process.env.ALDI_BATCH_CONCURRENCY || 1);
    const concurrency = Math.max(1, Math.min(2, requested));

    const results = new Array(keywords.length);
    let cursor = 0;
    async function worker() {
        while (cursor < keywords.length) {
            const index = cursor++;
            try {
                results[index] = await searchAldi(keywords[index], zipCode);
            } catch (error) {
                log.error('[aldi] Batch worker error:', error.message || error);
                results[index] = [];
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
}

module.exports = { searchAldi, searchAldiBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];
    if (!keyword) {
        log.error('Usage: node aldi.js <keyword> [zipCode]');
        process.exit(1);
    }
    searchAldi(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
