const playwright = require('playwright-core');
const chromium = require('@sparticuz/chromium');
const path = require('path');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { createRateLimiter } = require('../utils/rate-limiter');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const log = createScraperLogger('wholefoods');
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

// Hard kill switch.
const WFM_DISABLED = process.env.WHOLEFOODS_DISABLED === 'true';

// 0 = no cap.
const WFM_MAX_RESULTS = Number(process.env.WHOLEFOODS_MAX_RESULTS || process.env.SCRAPER_MAX_RESULTS || 0);

const PAGE_NAV_TIMEOUT_MS = Number(process.env.WHOLEFOODS_PAGE_TIMEOUT_MS || 60000);
const PRODUCT_WAIT_TIMEOUT_MS = Number(process.env.WHOLEFOODS_PRODUCT_WAIT_MS || 20000);

const { enforceRateLimit } = createRateLimiter({
    requestsPerSecond: Number(process.env.WHOLEFOODS_REQUESTS_PER_SECOND || 1),
    minIntervalMs: Number(process.env.WHOLEFOODS_MIN_REQUEST_INTERVAL_MS || 2000),
    enableJitter: process.env.WHOLEFOODS_ENABLE_JITTER !== 'false',
    log,
    label: '[wholefoods]',
});

// Whole Foods is owned by Amazon. Their /search page on wholefoodsmarket.com
// is a Next.js app that fetches results client-side after render. There's no
// stable, unauthenticated JSON endpoint we can hit, and Amazon's bot
// protection on the API is aggressive. Playwright + DOM scrape is the path.
async function fetchRawWFMData(keyword, zipCode) {
    let browser = null;
    const rawData = [];

    try {
        log.debug(`Fetching Whole Foods data for '${keyword}' zip=${zipCode || 'none'}...`);

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

        await page.goto(`https://www.wholefoodsmarket.com/search?text=${encodeURIComponent(keyword)}`, {
            timeout: PAGE_NAV_TIMEOUT_MS,
            waitUntil: 'domcontentloaded',
        });

        // Best-effort cookie / location prompt dismissal.
        try {
            for (const sel of [
                "button:has-text('Accept')",
                "button[aria-label='Close']",
                "button:has-text('No thanks')",
            ]) {
                const btn = page.locator(sel).filter({ visible: true }).first();
                if (await btn.count() > 0) {
                    await btn.click({ timeout: 2000 }).catch(() => {});
                }
            }
        } catch {
            // noop
        }

        // Try product card selectors in order of stability. WFM ships several
        // testid variants over time; falling back is cheaper than guessing.
        const candidates = [
            "[data-testid='product-tile']",
            "[data-testid='product-card']",
            "article[data-testid*='product']",
            "li[data-testid*='product']",
        ];

        let foundSelector = null;
        for (const sel of candidates) {
            try {
                await page.waitForSelector(sel, { timeout: PRODUCT_WAIT_TIMEOUT_MS / candidates.length });
                foundSelector = sel;
                break;
            } catch {
                continue;
            }
        }

        if (!foundSelector) {
            // Fallback: any element containing a price.
            log.warn('WFM: no known product-tile selector matched; falling back to generic $ scan.');
            foundSelector = ":is(article, li, div):has(:text('$'))";
        }

        await page.waitForTimeout(2000); // lazy images

        const cards = await page.locator(foundSelector).all();
        log.debug(`WFM: found ${cards.length} cards via selector ${foundSelector}`);

        let count = 0;
        for (const card of cards) {
            if (WFM_MAX_RESULTS > 0 && count >= WFM_MAX_RESULTS) break;
            try {
                const text = (await card.innerText()).trim();
                if (!text || !text.includes('$')) continue;
                let imgUrl = '';
                try {
                    const img = card.locator('img').first();
                    if (await img.count() > 0) {
                        imgUrl = (await img.getAttribute('src')) || '';
                    }
                } catch {}
                let href = '';
                try {
                    const link = card.locator('a').first();
                    if (await link.count() > 0) href = (await link.getAttribute('href')) || '';
                } catch {}
                rawData.push({ text, img: imgUrl, href });
                count++;
            } catch (cardErr) {
                log.debug('WFM: card scrape error:', cardErr.message);
            }
        }
    } catch (error) {
        log.error('Whole Foods Playwright error:', error.message);
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

        // WFM cards typically: "Brand\nProduct name, size\n$X.XX\n$X.XX/oz" or similar.
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

        // First line that's not the title and not a price ~ brand.
        const brandLine = lines.find((l) => l !== titleLine && !l.startsWith('$') && l.length > 1 && l.length < 40);

        const productId = item.href ? item.href.split('/').filter(Boolean).pop() : null;

        products.push({
            id: productId || `wfm-${Math.floor(Math.random() * 90000) + 10000}`,
            product_id: productId,
            title: titleLine,
            product_name: titleLine,
            brand: brandLine && brandLine !== titleLine ? brandLine : 'Whole Foods',
            price,
            pricePerUnit,
            unit,
            rawUnit: unit,
            image_url: item.img || '/placeholder.svg',
            provider: 'Whole Foods',
            location: 'Whole Foods Market',
            category: 'Grocery',
        });
    }
    return products;
}

async function searchWholeFoods(keyword, zipCode) {
    if (WFM_DISABLED) {
        log.debug(`[wholefoods] WHOLEFOODS_DISABLED=true, skipping keyword="${keyword}"`);
        return [];
    }

    try {
        await enforceRateLimit();
        const rawData = await fetchRawWFMData(keyword, zipCode);
        if (!rawData.length) {
            log.warn(`Whole Foods: 0 raw cards for "${keyword}"`);
            return [];
        }

        const products = parseRawItemsWithRegex(rawData);
        if (products.length === 0) {
            log.warn(`Whole Foods: regex parsed 0 products from ${rawData.length} cards. Sample text: ${JSON.stringify(rawData[0]?.text?.slice(0, 200))}`);
            return [];
        }

        log.debug(`Whole Foods: extracted ${products.length} products`);
        return products.sort((a, b) => a.price - b.price);
    } catch (error) {
        log.error('Error in Whole Foods search:', error.message);
        return [];
    }
}

async function searchWholeFoodsBatch(keywords, zipCode, options = {}) {
    if (!Array.isArray(keywords) || keywords.length === 0) return [];

    const requested = Number(options?.concurrency || process.env.WHOLEFOODS_BATCH_CONCURRENCY || 1);
    const concurrency = Math.max(1, Math.min(2, requested));

    const results = new Array(keywords.length);
    let cursor = 0;

    async function worker() {
        while (cursor < keywords.length) {
            const index = cursor++;
            const keyword = keywords[index];
            try {
                results[index] = await searchWholeFoods(keyword, zipCode);
            } catch (error) {
                log.error('[wholefoods] Batch worker error:', error.message || error);
                results[index] = [];
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
}

module.exports = { searchWholeFoods, searchWholeFoodsBatch };

if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword) {
        log.error('Usage: node wholefoods.js <keyword> [zipCode]');
        process.exit(1);
    }

    searchWholeFoods(keyword, zipCode).then((results) => {
        console.log(JSON.stringify(results, null, 2));
    }).catch((err) => {
        log.error(err);
        process.exit(1);
    });
}
