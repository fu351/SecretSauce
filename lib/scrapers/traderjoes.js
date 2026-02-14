const path = require('path');
const { createScraperLogger } = require('./logger');
const { withScraperTimeout } = require('./runtime-config');
const { fetchJinaReader } = require('./jina-client');
const { getOpenAIApiKey, hasConfiguredOpenAIKey, requestOpenAIJson } = require('./llm-fallback');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const log = createScraperLogger('traderjoes');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => withScraperTimeout(promise, ms);

// Utility function for exponential backoff retry
async function withRetry(fn, options = {}) {
    const {
        maxRetries = JINA_MAX_RETRIES,
        baseDelay = JINA_RETRY_DELAY_MS,
        maxDelay = 10000,
        timeoutMultiplier = 1.5,
        initialTimeout = JINA_TIMEOUT_MS
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Calculate dynamic timeout: increases with each retry
            const currentTimeout = Math.min(
                initialTimeout * Math.pow(timeoutMultiplier, attempt),
                initialTimeout * 3 // Cap at 3x the initial timeout
            );

            log.debug(`Attempt ${attempt + 1}/${maxRetries + 1} with timeout ${currentTimeout}ms`);

            return await fn(currentTimeout, attempt);
        } catch (error) {
            lastError = error;

            const status = error?.response?.status ?? error?.status;
            let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

            if (status === 429) {
                const retryAfterMs = parseRetryAfterHeaderToMs(error?.response?.headers?.["retry-after"]);
                delay = Math.max(delay, JINA_MIN_RETRY_DELAY_MS, retryAfterMs || 0);

                const cooldownEntered = registerJina429AndMaybeEnterCooldown(retryAfterMs || delay);
                log.warn(
                    `[traderjoes] Jina rate limit (429) on attempt ${attempt + 1}/${maxRetries + 1}; ` +
                    `retrying in ${delay}ms${cooldownEntered ? " (entering cooldown)" : ""}`
                );

                if (cooldownEntered) {
                    break;
                }
            } else {
                resetJina429State();
            }

            // Don't retry on the last attempt
            if (attempt === maxRetries) {
                break;
            }

            log.debug(`Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay}ms...`);

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

// Environment variables for API keys
const OPENAI_API_KEY = getOpenAIApiKey();
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 25000);
const JINA_TIMEOUT_MS = Number(
    process.env.TRADERJOES_JINA_TIMEOUT_MS ||
    process.env.JINA_TIMEOUT_MS ||
    Math.min(REQUEST_TIMEOUT_MS, 20000)
);
const JINA_TOTAL_TIMEOUT_MS = Number(
    process.env.TRADERJOES_JINA_TOTAL_TIMEOUT_MS ||
    Math.max(JINA_TIMEOUT_MS * 2, 30000)
);
const JINA_MAX_RETRIES = Number(process.env.TRADERJOES_JINA_MAX_RETRIES || process.env.JINA_MAX_RETRIES || 1);
const JINA_RETRY_DELAY_MS = Number(process.env.TRADERJOES_JINA_RETRY_DELAY_MS || process.env.JINA_RETRY_DELAY_MS || 2000);
const JINA_MIN_RETRY_DELAY_MS = Number(process.env.TRADERJOES_JINA_MIN_429_RETRY_DELAY_MS || 5000);
const JINA_429_COOLDOWN_MS = Number(process.env.TRADERJOES_JINA_429_COOLDOWN_MS || 90000);
const JINA_MAX_CONSECUTIVE_429 = Number(process.env.TRADERJOES_JINA_MAX_CONSECUTIVE_429 || 5);
const JINA_COOLDOWN_SLEEP_CAP_MS = Number(process.env.TRADERJOES_JINA_COOLDOWN_SLEEP_CAP_MS || 10000);
const TJ_CACHE_TTL_MS = Number(process.env.TRADERJOES_CACHE_TTL_MS || 5 * 60 * 1000);
const DEFAULT_BATCH_CONCURRENCY = Number(process.env.TRADERJOES_BATCH_CONCURRENCY || 3);
const MAX_BATCH_CONCURRENCY = 8;
const TJ_MAX_RESULTS = Number(process.env.TRADERJOES_MAX_RESULTS || 5);
const TJ_LLM_PRODUCT_FALLBACK_LIMIT = Number(process.env.TRADERJOES_LLM_PRODUCT_FALLBACK_LIMIT || 8);

let traderJoesConsecutive429 = 0;
let traderJoes429CooldownUntilMs = 0;

// In-memory dedupe + cache to avoid duplicate crawl/LLM calls for identical queries.
const traderJoesResultCache = new Map();
const traderJoesInFlight = new Map();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfterHeaderToMs(retryAfterValue) {
    if (!retryAfterValue) {
        return 0;
    }

    const asNumber = Number(retryAfterValue);
    if (Number.isFinite(asNumber) && asNumber > 0) {
        return Math.round(asNumber * 1000);
    }

    const asDateMs = Date.parse(String(retryAfterValue));
    if (Number.isFinite(asDateMs)) {
        return Math.max(0, asDateMs - Date.now());
    }

    return 0;
}

function isJinaCooldownActive() {
    return Date.now() < traderJoes429CooldownUntilMs;
}

function getJinaCooldownRemainingMs() {
    return Math.max(0, traderJoes429CooldownUntilMs - Date.now());
}

async function sleepDuringJinaCooldown(contextLabel) {
    if (!isJinaCooldownActive()) {
        return;
    }

    const remainingMs = getJinaCooldownRemainingMs();
    const sleepMs = Math.max(0, Math.min(remainingMs, JINA_COOLDOWN_SLEEP_CAP_MS));
    if (sleepMs <= 0) {
        return;
    }

    log.warn(`[traderjoes] ${contextLabel}: Jina cooldown active, sleeping ${sleepMs}ms before continuing`);
    await sleep(sleepMs);
}

function registerJina429AndMaybeEnterCooldown(suggestedDelayMs = 0) {
    traderJoesConsecutive429 += 1;

    if (traderJoesConsecutive429 < JINA_MAX_CONSECUTIVE_429) {
        return false;
    }

    const cooldownMs = Math.max(JINA_429_COOLDOWN_MS, suggestedDelayMs || 0);
    traderJoes429CooldownUntilMs = Date.now() + cooldownMs;
    return true;
}

function resetJina429State() {
    traderJoesConsecutive429 = 0;
    if (!isJinaCooldownActive()) {
        traderJoes429CooldownUntilMs = 0;
    }
}

function buildTraderJoesRateLimitError(message, code = "TJ_JINA_RATE_LIMIT", status = 429) {
    const err = new Error(message);
    err.code = code;
    err.status = status;
    return err;
}

function isTraderJoesRateLimitError(error) {
    if (!error) return false;
    const status = error?.status ?? error?.response?.status;
    return status === 429 || String(error?.code || "").startsWith("TJ_JINA_");
}

function normalizeKeyword(keyword) {
    return String(keyword || "").trim().toLowerCase();
}

function buildCacheKey(keyword, zipCode) {
    return `${normalizeKeyword(keyword)}::${String(zipCode || "").trim()}`;
}

function getCachedResult(cacheKey) {
    const cached = traderJoesResultCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (Date.now() - cached.fetchedAt > TJ_CACHE_TTL_MS) {
        traderJoesResultCache.delete(cacheKey);
        return null;
    }

    return cached.results;
}

function setCachedResult(cacheKey, results) {
    traderJoesResultCache.set(cacheKey, {
        fetchedAt: Date.now(),
        results,
    });
}

function toOptionalString(value) {
    if (value === null || value === undefined) return "";
    const normalized = String(value).trim();
    if (!normalized) return "";
    if (/^(?:n\/a|na|none|null|undefined)$/i.test(normalized)) return "";
    return normalized;
}

function toPriceNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string") {
        const stripped = value.replace(/[^0-9.-]/g, "");
        const parsed = Number.parseFloat(stripped);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function appendQtyUnitToProductName(productName, unitText) {
    const baseName = toOptionalString(productName);
    if (!baseName) return "";

    const normalizedUnit = toOptionalString(unitText);
    if (!normalizedUnit) return baseName;

    const baseLower = baseName.toLowerCase();
    const unitLower = normalizedUnit.toLowerCase();
    if (baseLower.includes(unitLower)) {
        return baseName;
    }

    return `${baseName} ${normalizedUnit}`.trim();
}

function extractProductIdFromUrl(productUrl) {
    const normalized = toOptionalString(productUrl);
    if (!normalized) return null;

    const withoutQuery = normalized.split("?")[0];
    const idMatch = withoutQuery.match(/-(\d{4,})$/);
    if (!idMatch) return null;
    return idMatch[1];
}

function inferUnitFromPricePerUnit(pricePerUnit) {
    const normalized = toOptionalString(pricePerUnit);
    if (!normalized) return "";
    const suffixMatch = normalized.match(/\/\s*([a-z0-9.\s]+)$/i);
    return toOptionalString(suffixMatch?.[1]);
}

function hasQuantityAndUnitToken(value) {
    const normalized = toOptionalString(value);
    if (!normalized) return false;

    // Accept common formats: "12 Oz", "13.5 Fl Oz", "1/2 Lb", "2 ct", "750 mL".
    return /\d/.test(normalized) && /[a-z]/i.test(normalized);
}

function extractQtyUnitFromPricePerUnit(pricePerUnit) {
    const normalized = toOptionalString(pricePerUnit);
    if (!normalized) return "";
    const suffixMatch = normalized.match(/\/\s*([^\n]+?)\s*$/i);
    return toOptionalString(suffixMatch?.[1]);
}

function resolveQtyUnitText(rawProduct) {
    const quantityCandidate = toOptionalString(
        rawProduct?.quantity || rawProduct?.qty || rawProduct?.size_qty || rawProduct?.pack_qty
    );
    const unitCandidate = toOptionalString(
        rawProduct?.unit || rawProduct?.uom || rawProduct?.measure_unit
    );

    if (quantityCandidate && unitCandidate) {
        const combined = `${quantityCandidate} ${unitCandidate}`.trim();
        if (hasQuantityAndUnitToken(combined)) {
            return combined;
        }
    }

    const sizeCandidate = toOptionalString(rawProduct?.size || rawProduct?.package_size || rawProduct?.unit_size);
    if (hasQuantityAndUnitToken(sizeCandidate)) {
        return sizeCandidate;
    }

    const pricePerUnitQty = extractQtyUnitFromPricePerUnit(rawProduct?.price_per_unit || rawProduct?.pricePerUnit);
    if (hasQuantityAndUnitToken(pricePerUnitQty)) {
        return pricePerUnitQty;
    }

    if (hasQuantityAndUnitToken(unitCandidate)) {
        return unitCandidate;
    }

    return "";
}

function normalizeTraderJoesProduct(rawProduct) {
    const numericPrice = toPriceNumber(rawProduct?.price);
    const productName = toOptionalString(rawProduct?.product_name || rawProduct?.title || rawProduct?.name);
    const qtyUnitText = resolveQtyUnitText(rawProduct);
    const pricePerUnit = toOptionalString(rawProduct?.price_per_unit || rawProduct?.pricePerUnit);
    const inferredUnit = toOptionalString(rawProduct?.unit || inferUnitFromPricePerUnit(pricePerUnit));
    const productId = toOptionalString(rawProduct?.id ?? rawProduct?.product_id);

    if (!productName || !numericPrice || numericPrice <= 0) {
        return null;
    }

    const nameWithQty = appendQtyUnitToProductName(productName, qtyUnitText);
    const normalizedSize = toOptionalString(qtyUnitText || rawProduct?.size || rawProduct?.package_size || rawProduct?.unit_size);
    const normalizedUnit = toOptionalString(qtyUnitText || inferredUnit);

    return {
        product_id: productId || null,
        id: productId || null,
        product_name: nameWithQty,
        title: nameWithQty,
        price: Number(numericPrice),
        image_url: toOptionalString(rawProduct?.image_url) || "/placeholder.svg",
        provider: "Trader Joe's",
        location: "Trader Joe's Store",
        size: normalizedSize,
        unit: normalizedUnit,
        pricePerUnit,
        price_per_unit: pricePerUnit,
    };
}

function scoreProductRelevance(productName, keyword) {
    const name = toOptionalString(productName).toLowerCase();
    const normalizedKeyword = normalizeKeyword(keyword);
    if (!name || !normalizedKeyword) return 0;

    const tokens = normalizedKeyword.split(/\s+/).filter(Boolean);
    let score = 0;

    if (name.includes(normalizedKeyword)) {
        score += 100;
    }

    for (const token of tokens) {
        if (token.length < 2) continue;
        if (name.includes(token)) {
            score += 10;
        }
    }

    return score;
}

function dedupeProducts(products) {
    const seen = new Set();
    const deduped = [];

    for (const product of products) {
        const idKey = toOptionalString(product?.id || product?.product_id);
        const nameKey = toOptionalString(product?.product_name || product?.title).toLowerCase();
        const priceKey = Number(product?.price);
        const compositeKey = idKey
            ? `id:${idKey}`
            : `name:${nameKey}|price:${Number.isFinite(priceKey) ? priceKey.toFixed(2) : "na"}`;

        if (seen.has(compositeKey)) {
            continue;
        }

        seen.add(compositeKey);
        deduped.push(product);
    }

    return deduped;
}

function rankAndLimitProducts(products, keyword, limit = TJ_MAX_RESULTS) {
    return products
        .map(product => ({
            ...product,
            _relevanceScore: scoreProductRelevance(product?.product_name || product?.title, keyword),
        }))
        .sort((a, b) => {
            if (b._relevanceScore !== a._relevanceScore) {
                return b._relevanceScore - a._relevanceScore;
            }
            return Number(a.price || 0) - Number(b.price || 0);
        })
        .slice(0, limit)
        .map(({ _relevanceScore, ...product }) => product);
}

// Function to crawl Trader Joe's search page using Jina AI Reader API
async function crawlTraderJoesWithJina(keyword) {
    try {
        if (isJinaCooldownActive()) {
            await sleepDuringJinaCooldown("crawl");
            const remainingMs = getJinaCooldownRemainingMs();
            throw buildTraderJoesRateLimitError(
                `[traderjoes] Jina cooldown active for ${remainingMs}ms`,
                "TJ_JINA_COOLDOWN",
                429
            );
        }

        log.debug(`Crawling Trader Joe's search page for: ${keyword} using Jina AI`);

        // Build Trader Joe's search URL
        const searchUrl = `https://www.traderjoes.com/home/search?q=${encodeURIComponent(keyword)}&section=products&global=yes`;
        const jinaReaderUrl = `https://r.jina.ai/${searchUrl}`;

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            // We are NOT setting "X-Retain-Images": "none" to get image URLs
        };

        // Call Jina AI Reader API with retry logic and dynamic timeouts
        const response = await withTimeout(withRetry(async (currentTimeout, attempt) => {
            log.debug(`Jina AI request for Trader Joe's (attempt ${attempt + 1})`);

            // Calculate axios timeout as 90% of total timeout to allow for cleanup
            const axiosTimeout = Math.floor(currentTimeout * 0.9);

            return await withTimeout(
                fetchJinaReader(jinaReaderUrl, {
                    headers: headers,
                    timeoutMs: axiosTimeout,
                }),
                currentTimeout
            );
        }, {
            initialTimeout: JINA_TIMEOUT_MS,
            maxRetries: JINA_MAX_RETRIES,
            baseDelay: JINA_RETRY_DELAY_MS
        }), JINA_TOTAL_TIMEOUT_MS);

        if (!response.data) {
            log.warn("No content retrieved from Jina AI API");
            return null;
        }

        log.debug(`Successfully retrieved content from Jina AI (${response.data.length} chars)`);
        resetJina429State();

        // Jina returns the clean markdown text directly
        return response.data;

    } catch (error) {
        if (isTraderJoesRateLimitError(error)) {
            const remainingMs = getJinaCooldownRemainingMs();

            log.warn(
                `[traderjoes] Jina rate-limited for "${keyword}" ` +
                `(consecutive_429=${traderJoesConsecutive429}${remainingMs > 0 ? `, cooldown_ms=${remainingMs}` : ""})`
            );

            throw buildTraderJoesRateLimitError(
                `[traderjoes] Jina 429 for "${keyword}"`,
                isJinaCooldownActive() ? "TJ_JINA_COOLDOWN" : "TJ_JINA_429",
                429
            );
        }

        log.error("Error crawling with Jina AI after all retries:", error.message);
        return null;
    }
}

function parseProductsWithRegex(crawledContent, keyword) {
    const content = String(crawledContent || "");
    if (!content) {
        return { products: [], unresolvedBlocks: [] };
    }

    // Example block we target:
    // ### [Product Name](product_url)
    // ![Image ...](image_url)[Category](category_url)$4.99/12 Oz
    const cardRegex =
        /###\s+\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*\n+\s*!\[[^\]]*]\((https?:\/\/[^\s)]+)\)\[[^\]]*]\((?:https?:\/\/[^\s)]+)\)\s*([^\n]*)/gi;

    const products = [];
    const unresolvedBlocks = [];

    let match;
    while ((match = cardRegex.exec(content)) !== null) {
        const [rawBlock, rawName, productUrl, imageUrl, rawPriceTail = ""] = match;
        const productName = toOptionalString(rawName);
        const productId = extractProductIdFromUrl(productUrl);

        // Format target: $4.99/12 Oz
        const priceMatch = rawPriceTail.match(/\$(\d+(?:\.\d{1,2})?)\s*\/\s*([^\n]+?)\s*$/i);
        const numericPrice = toPriceNumber(priceMatch?.[1]);
        const qtyUnit = toOptionalString(priceMatch?.[2]);

        if (!productName || !numericPrice || numericPrice <= 0 || !qtyUnit) {
            unresolvedBlocks.push(rawBlock);
            continue;
        }

        const nameWithQty = appendQtyUnitToProductName(productName, qtyUnit);
        products.push({
            product_id: productId || null,
            id: productId || null,
            product_name: nameWithQty,
            title: nameWithQty,
            price: Number(numericPrice),
            image_url: toOptionalString(imageUrl) || "/placeholder.svg",
            provider: "Trader Joe's",
            location: "Trader Joe's Store",
            size: qtyUnit,
            unit: qtyUnit,
            pricePerUnit: `$${Number(numericPrice).toFixed(2)}/${qtyUnit}`,
            price_per_unit: `$${Number(numericPrice).toFixed(2)}/${qtyUnit}`,
        });
    }

    const ranked = rankAndLimitProducts(dedupeProducts(products), keyword, TJ_MAX_RESULTS);
    return { products: ranked, unresolvedBlocks };
}

async function parseSingleProductBlockWithLLM(productBlockMarkdown, keyword) {
    if (!hasConfiguredOpenAIKey(OPENAI_API_KEY)) {
        return null;
    }

    const prompt = `
You are a web scraping assistant. Extract exactly one Trader Joe's product from this markdown block.

Search keyword: "${keyword}"

Return ONLY valid JSON for one object in this format:
{
  "product_name": "Product Name Here",
  "price": 4.99,
  "unit": "12 Oz",
  "size": "12 Oz",
  "price_per_unit": "$4.99/12 Oz",
  "image_url": "https://example.com/image.jpg",
  "id": "unique-identifier"
}

If no valid product can be extracted, return null.

Markdown block:
${String(productBlockMarkdown || "").slice(0, 4000)}
`;

    const parsed = await requestOpenAIJson({
        prompt,
        systemPrompt: "You extract one product from markdown and return only strict JSON.",
        openAiApiKey: OPENAI_API_KEY,
        maxTokens: 700,
        temperature: 0,
        timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
    });

    if (!parsed) return null;
    if (parsed === "null") return null;
    return normalizeTraderJoesProduct(parsed);
}

async function parseMissingProductsWithLLM(unresolvedBlocks, keyword) {
    if (!Array.isArray(unresolvedBlocks) || unresolvedBlocks.length === 0) {
        return [];
    }

    if (!hasConfiguredOpenAIKey(OPENAI_API_KEY)) {
        return [];
    }

    const maxFallbacks = Math.max(0, Math.min(TJ_LLM_PRODUCT_FALLBACK_LIMIT, unresolvedBlocks.length));
    if (maxFallbacks === 0) return [];

    const llmResolved = [];
    for (const rawBlock of unresolvedBlocks.slice(0, maxFallbacks)) {
        try {
            const parsed = await parseSingleProductBlockWithLLM(rawBlock, keyword);
            if (parsed) {
                llmResolved.push(parsed);
            }
        } catch (error) {
            log.warn(`[traderjoes] LLM block fallback failed: ${error?.message || error}`);
        }
    }

    return llmResolved;
}

// Full-page LLM fallback when regex parsing cannot recover enough products.
async function parseProductsWithLLM(crawledContent, keyword) {
    try {
        log.debug(`Parsing products with LLM for keyword: ${keyword}`);

        if (!hasConfiguredOpenAIKey(OPENAI_API_KEY)) {
            log.warn("Missing OPENAI_API_KEY, cannot parse Trader Joe's products with LLM");
            return [];
        }
        
        const prompt = `
You are a web scraping assistant. Extract the top 5 grocery/food products and their prices from this Trader Joe's search page content.

Search keyword: "${keyword}"

Instructions:
1. Find products that match or are related to "${keyword}"
2. Extract exactly 5 products (or fewer if less available)
3. For each product, extract: product_name, brand (usually "Trader Joe's"), price, image URL, and unit details.
4. The image URL will likely be in markdown format, like \`![alt text](image_url)\`. Extract the URL.
5. Unit details:
   - unit: package/size unit text such as "16 oz", "12 ct", "1 lb", "750 ml"
   - size: same packaging size text when present
   - price_per_unit: unit pricing text if visible such as "$0.31/oz"
   - If unit info is missing, use empty string.
6. Focus on grocery/food items only
7. Return ONLY valid JSON in this exact format:

[
  {
    "product_name": "Product Name Here",
    "brand": "Brand Name (e.g., Trader Joe's)",
    "price": 4.99,
    "unit": "16 oz",
    "image_url": "https://example.com/image.jpg",
    "id": "unique-identifier"
  }
]

Trader Joe's page content:
${crawledContent.substring(0, 30000)}  // Limit content to stay within token limits

Return only the JSON array, no other text.`;

        const products = await requestOpenAIJson({
            prompt,
            openAiApiKey: OPENAI_API_KEY,
            maxTokens: 2000,
            temperature: 0.1,
            timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
        });

        if (!Array.isArray(products)) {
            log.warn("No content returned from LLM");
            return [];
        }
        const normalized = Array.isArray(products)
            ? products.map(normalizeTraderJoesProduct).filter(Boolean)
            : [];

        return rankAndLimitProducts(dedupeProducts(normalized), keyword, TJ_MAX_RESULTS);

    } catch (error) {
        log.error("Error parsing products with LLM:", error.message);
        if (error.response?.data) {
            log.error("LLM Error Response:", error.response.data);
        }
        return [];
    }
}

// Main Trader Joe's search function
async function searchTraderJoes(keyword, zipCode) {
    const cacheKey = buildCacheKey(keyword, zipCode);
    const cached = getCachedResult(cacheKey);
    if (cached) {
        return cached;
    }

    if (isJinaCooldownActive()) {
        await sleepDuringJinaCooldown("search");
        throw buildTraderJoesRateLimitError(
            `[traderjoes] Jina cooldown active for ${getJinaCooldownRemainingMs()}ms`,
            "TJ_JINA_COOLDOWN",
            429
        );
    }

    const existingInFlight = traderJoesInFlight.get(cacheKey);
    if (existingInFlight) {
        return existingInFlight;
    }

    const scrapePromise = (async () => {
    try {
        if (!normalizeKeyword(keyword)) {
            return [];
        }

        // Step 1: Crawl Trader Joe's page
        const crawledContent = await crawlTraderJoesWithJina(keyword);

        if (!crawledContent) {
            log.debug("Failed to crawl Trader Joe's page, real-time prices unavailable");
            return [];
        }

        // Step 2: Parse products using regex first.
        const regexParsed = parseProductsWithRegex(crawledContent, keyword);
        let products = regexParsed.products;

        // Step 3: If regex couldn't parse some entries, attempt per-product LLM fallback.
        if (regexParsed.unresolvedBlocks.length > 0) {
            const llmProductFallbacks = await parseMissingProductsWithLLM(regexParsed.unresolvedBlocks, keyword);
            if (llmProductFallbacks.length > 0) {
                products = rankAndLimitProducts(
                    dedupeProducts([...products, ...llmProductFallbacks]),
                    keyword,
                    TJ_MAX_RESULTS
                );
            }
        }

        // Step 4: Last resort full-page LLM fallback.
        if (products.length === 0) {
            products = await parseProductsWithLLM(crawledContent, keyword);
        }

        if (products.length === 0) {
            log.debug("Regex + LLM fallback failed to extract products, real-time prices unavailable");
            return [];
        }

        log.debug(`Successfully extracted ${products.length} products from Trader Joe's`);
        const sorted = products.sort((a, b) => a.price - b.price);
        setCachedResult(cacheKey, sorted);
        return sorted;

    } catch (error) {
        if (isTraderJoesRateLimitError(error)) {
            throw error;
        }
        log.error("Error in Trader Joe's search:", error.message, "- real-time prices unavailable");
        return [];
    }
    })();

    traderJoesInFlight.set(cacheKey, scrapePromise);
    try {
        return await scrapePromise;
    } finally {
        traderJoesInFlight.delete(cacheKey);
    }
}

async function searchTraderJoesBatch(keywords, zipCode, options = {}) {
    if (!Array.isArray(keywords) || keywords.length === 0) {
        return [];
    }

    const requestedConcurrency = Number(options?.concurrency || DEFAULT_BATCH_CONCURRENCY);
    const concurrency = Math.max(1, Math.min(MAX_BATCH_CONCURRENCY, requestedConcurrency));

    const results = new Array(keywords.length);
    let cursor = 0;
    let fatalRateLimitError = null;

    async function worker() {
        while (cursor < keywords.length) {
            if (fatalRateLimitError) {
                return;
            }
            const index = cursor++;
            const keyword = keywords[index];
            try {
                results[index] = await searchTraderJoes(keyword, zipCode);
            } catch (error) {
                if (isTraderJoesRateLimitError(error)) {
                    fatalRateLimitError = error;
                    return;
                }
                log.error("Trader Joe's batch worker error:", error.message || error);
                results[index] = [];
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    if (fatalRateLimitError) {
        throw fatalRateLimitError;
    }
    return results;
}

// Function to generate fallback mock data
function generateMockTraderJoesData(keyword) {
    log.debug("Generating mock Trader Joe's data as fallback...");

    const basePrice = Math.random() * 8 + 2;
    const timestamp = Date.now();

    return [
        {
            product_id: `tj-mock-1-${timestamp}`,
            product_name: `Trader Joe's ${keyword}`,
            price: Math.round(basePrice * 100) / 100,
            image_url: "/placeholder.svg"
        },
        {
            product_id: `tj-mock-2-${timestamp}`,
            product_name: `Organic ${keyword}`,
            price: Math.round((basePrice + 0.75) * 100) / 100,
            image_url: "/placeholder.svg"
        },
        {
            product_id: `tj-mock-3-${timestamp}`,
            product_name: `${keyword} Blend`,
            price: Math.round((basePrice + 1.25) * 100) / 100,
            image_url: "/placeholder.svg"
        },
        {
            product_id: `tj-mock-4-${timestamp}`,
            product_name: `Fresh ${keyword}`,
            price: Math.round((basePrice - 0.5) * 100) / 100,
            image_url: "/placeholder.svg"
        },
        {
            product_id: `tj-mock-5-${timestamp}`,
            product_name: `Premium ${keyword}`,
            price: Math.round((basePrice + 2) * 100) / 100,
            image_url: "/placeholder.svg"
        }
    ];
}

// Main function to execute the script
async function main() {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        log.error("Usage: node traderjoes.js <keyword> <zipCode>");
        log.error("Note: You need OPENAI_API_KEY environment variable");
        process.exit(1);
    }

    if (!hasConfiguredOpenAIKey(OPENAI_API_KEY)) {
        log.warn("⚠️  Missing OPENAI_API_KEY - using mock data");
        log.warn("Set OPENAI_API_KEY environment variable for real data");
        console.log(JSON.stringify(generateMockTraderJoesData(keyword), null, 2));
        return;
    }

    try {
        log.debug(`🔍 Searching Trader Joe's for "${keyword}" using Jina AI + LLM approach...`);

        const results = await searchTraderJoes(keyword, zipCode);

        if (results.length === 0) {
            log.debug("No results from Jina/LLM approach, real-time prices unavailable");
        }

        console.log(JSON.stringify(results, null, 2));

    } catch (err) {
        log.error("Error in main:", err);
        console.log(JSON.stringify([], null, 2));
    }
}

// Export for use as a module
module.exports = { 
    searchTraderJoes,
    searchTraderJoesBatch
};

// Run if called directly
if (require.main === module) {
    main();
}
