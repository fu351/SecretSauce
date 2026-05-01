const playwright = require('playwright-core');
const chromium = require('@sparticuz/chromium');
const { createScraperLogger } = require('../utils/logger');
const { withScraperTimeout } = require('../utils/runtime-config');
const { createRateLimiter } = require('../utils/rate-limiter');

/**
 * Build a scraper for any retailer hosted on Instacart's storefront platform.
 *
 * Instacart white-labels grocery e-commerce for many regional and national
 * chains. The DOM/markup is consistent across them, so a single Playwright +
 * regex pipeline handles every storefront with only the slug differing.
 *
 * Usage:
 *   const { search, batch } = createInstacartStoreScraper({
 *       slug: 'sprouts',
 *       providerName: 'Sprouts',
 *       providerLocation: 'Sprouts Farmers Market',
 *       envPrefix: 'SPROUTS',
 *   });
 *   module.exports = { searchSprouts: search, searchSproutsBatch: batch };
 *
 * Each call resolves to the canonical product shape the rest of SecretSauce
 * expects: { id, title, brand, price, pricePerUnit, unit, rawUnit,
 *            image_url, provider, location, category }
 */
function createInstacartStoreScraper(config) {
    const {
        slug,
        providerName,
        providerLocation,
        envPrefix,
        brandFallback,
        category = 'Grocery',
        idPrefix,
    } = config;

    if (!slug) throw new Error('createInstacartStoreScraper: slug is required');
    if (!providerName) throw new Error('createInstacartStoreScraper: providerName is required');
    if (!envPrefix) throw new Error('createInstacartStoreScraper: envPrefix is required');

    const log = createScraperLogger(envPrefix.toLowerCase());
    const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

    const env = (k, fallback) => process.env[`${envPrefix}_${k}`] ?? fallback;

    const DISABLED = env('DISABLED', '') === 'true';
    const MAX_RESULTS = Number(env('MAX_RESULTS', process.env.SCRAPER_MAX_RESULTS || 0));
    const PAGE_NAV_TIMEOUT_MS = Number(env('PAGE_TIMEOUT_MS', 60000));
    const PRODUCT_WAIT_TIMEOUT_MS = Number(env('PRODUCT_WAIT_MS', 15000));
    const SLUG = env('INSTACART_SLUG', slug);

    const { enforceRateLimit } = createRateLimiter({
        requestsPerSecond: Number(env('REQUESTS_PER_SECOND', 1)),
        minIntervalMs: Number(env('MIN_REQUEST_INTERVAL_MS', 2000)),
        enableJitter: env('ENABLE_JITTER', 'true') !== 'false',
        log,
        label: `[${envPrefix.toLowerCase()}]`,
    });

    async function fetchRaw(keyword, zipCode) {
        let browser = null;
        const rawData = [];

        try {
            log.debug(`Fetching ${providerName} data for '${keyword}' zip=${zipCode || 'none'} (slug=${SLUG})...`);

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

            await page.goto(`https://www.instacart.com/store/${SLUG}/search/${encodeURIComponent(keyword)}`, {
                timeout: PAGE_NAV_TIMEOUT_MS,
                waitUntil: 'domcontentloaded',
            });

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
                log.warn(`${providerName}: nav warning: ${navErr.message}`);
            }

            try {
                await page.waitForSelector('li', { timeout: PRODUCT_WAIT_TIMEOUT_MS });
                await page.waitForTimeout(2500);
            } catch {
                log.warn(`${providerName}: timeout waiting for product list items`);
            }

            const items = await page.locator('li').filter({ hasText: '$' }).all();
            log.debug(`${providerName}: found ${items.length} item cards`);

            let count = 0;
            for (const item of items) {
                if (MAX_RESULTS > 0 && count >= MAX_RESULTS) break;
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
                    log.debug(`${providerName} card scrape error:`, cardErr.message);
                }
            }
        } catch (error) {
            log.error(`${providerName} Playwright error:`, error.message);
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
                id: `${idPrefix || envPrefix.toLowerCase()}-${Math.floor(Math.random() * 90000) + 10000}`,
                title: titleLine,
                brand: brandFallback || providerName,
                price,
                pricePerUnit,
                unit,
                rawUnit: unit,
                image_url: item.img || '/placeholder.svg',
                provider: providerName,
                location: providerLocation,
                category,
            });
        }
        return products;
    }

    async function search(keyword, zipCode) {
        if (DISABLED) {
            log.debug(`[${envPrefix.toLowerCase()}] ${envPrefix}_DISABLED=true, skipping keyword="${keyword}"`);
            return [];
        }
        try {
            await enforceRateLimit();
            const rawData = await fetchRaw(keyword, zipCode);
            if (!rawData.length) {
                log.warn(`${providerName}: 0 raw cards for "${keyword}" in ${zipCode}`);
                return [];
            }
            const products = parseRawItemsWithRegex(rawData);
            if (products.length === 0) {
                log.warn(`${providerName}: regex parsed 0 products from ${rawData.length} cards. Sample: ${JSON.stringify(rawData[0]?.text?.slice(0, 200))}`);
                return [];
            }
            log.debug(`${providerName}: extracted ${products.length} products`);
            return products.sort((a, b) => a.price - b.price);
        } catch (error) {
            log.error(`Error in ${providerName} search:`, error.message);
            return [];
        }
    }

    async function batch(keywords, zipCode, options = {}) {
        if (!Array.isArray(keywords) || keywords.length === 0) return [];
        const requested = Number(options?.concurrency || env('BATCH_CONCURRENCY', 1));
        const concurrency = Math.max(1, Math.min(2, requested));

        const results = new Array(keywords.length);
        let cursor = 0;
        async function worker() {
            while (cursor < keywords.length) {
                const index = cursor++;
                try {
                    results[index] = await search(keywords[index], zipCode);
                } catch (error) {
                    log.error(`[${envPrefix.toLowerCase()}] Batch worker error:`, error.message || error);
                    results[index] = [];
                }
            }
        }
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        return results;
    }

    return { search, batch, log };
}

module.exports = { createInstacartStoreScraper };
