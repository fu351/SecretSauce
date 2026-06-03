/**
 * ScrapeGraphAI-backed scraper for Instacart-powered grocery stores.
 *
 * Replaces the disabled Playwright/Instacart scraper. Instead of driving a
 * headless browser through Instacart's login wall, this sends the store's
 * Instacart search URL to the ScrapeGraphAI cloud API (the official Node SDK,
 * `scrapegraph-js`) and asks the model to extract structured product data.
 *
 * The SDK call is injectable (`smartScraperFn`) so the logic is fully unit
 * testable without a network call or API key. At runtime it lazily loads the
 * SDK and reads the key from `SCRAPEGRAPH_API_KEY`.
 *
 * Self-hosted `scrapegraphai` (Python) was evaluated and rejected: v1.76.0
 * fails to import against current langchain-community (ChatOllama moved), so we
 * use the managed cloud API per the agreed fallback.
 */
const path = require('path');
const { createScraperLogger } = require('../utils/logger');

require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const log = createScraperLogger('instacart-scrapegraph');

// 0 means "no cap": return every product the model extracts.
const DEFAULT_MAX_RESULTS = Number(process.env.SCRAPER_MAX_RESULTS || 0);

// Map of normalized (lowercased) store name -> Instacart storefront slug.
// Kept aligned with the Instacart-backed chains in
// lib/store/price-source-disclaimers.ts (INSTACART_BACKED_STORE_KEYS).
const INSTACART_STORE_SLUGS = {
  safeway: 'safeway',
  albertsons: 'albertsons',
  vons: 'vons',
  pavilions: 'pavilions',
  jewel: 'jewel-osco',
  'jewel-osco': 'jewel-osco',
  acme: 'acme',
  shaws: 'shaws',
  sprouts: 'sprouts',
  publix: 'publix',
  wegmans: 'wegmans',
  shoprite: 'shoprite',
  'smart & final': 'smart-final',
  'smart and final': 'smart-final',
  'smart final': 'smart-final',
  'sams club': 'samsclub',
  "sam's club": 'samsclub',
  costco: 'costco',
  aldi: 'aldi',
};

function normalizeStoreKey(store) {
  return String(store || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Build the Instacart search URL for a store, or null if the store is unknown. */
function buildInstacartUrl(store, keyword) {
  const slug = INSTACART_STORE_SLUGS[normalizeStoreKey(store)];
  if (!slug) return null;
  return `https://www.instacart.com/store/${slug}/search/${encodeURIComponent(String(keyword || '').trim())}`;
}

/** Prompt instructing the model to extract grocery products for a search. */
function buildExtractionPrompt(keyword, zipCode) {
  const zipClause = zipCode ? ` Use store pricing for ZIP code ${zipCode} when available.` : '';
  return (
    `Extract the grocery search results for "${keyword}" from this Instacart store page.` +
    zipClause +
    ` Return a JSON object with a "products" array; each product has: ` +
    `name (string), price (number in USD, the item price not the per-unit price), ` +
    `price_per_unit (string, e.g. "$0.08/oz", or empty), and image_url (string, or empty). ` +
    `Only include real product listings with a visible price.`
  );
}

// Output schema hint passed to the API for structured extraction.
const PRODUCT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
          price_per_unit: { type: 'string' },
          image_url: { type: 'string' },
        },
        required: ['name', 'price'],
      },
    },
  },
};

/** Parse a price value that may be a number or a string like "$3.99". Returns null if not numeric. */
function parsePrice(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d{1,2})?/);
  if (!match) return null;
  const price = parseFloat(match[0]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function extractProductArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.products)) return data.products;
  if (data && data.data) return extractProductArray(data.data);
  return [];
}

/** Normalize raw ScrapeGraphAI output into the store product schema used across the app. */
function normalizeProducts(rawData, provider) {
  const items = extractProductArray(rawData);
  const products = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const title = String(item.name || item.title || '').trim();
    if (!title) continue;
    const price = parsePrice(item.price);
    if (price === null) continue;

    const pricePerUnit = String(item.price_per_unit || item.pricePerUnit || '').trim();
    const unitMatch = pricePerUnit.match(/\/\s*([^\s$]+)/);

    products.push({
      id: `ig-${provider.toLowerCase().replace(/[^a-z0-9]+/g, '')}-${products.length + 1}`,
      title,
      brand: provider,
      price,
      pricePerUnit,
      unit: unitMatch ? unitMatch[1] : '',
      rawUnit: unitMatch ? unitMatch[1] : '',
      image_url: String(item.image_url || item.imageUrl || '').trim() || '/placeholder.svg',
      provider,
      location: `${provider} Store`,
      category: 'Grocery',
    });
  }

  return products;
}

async function defaultSmartScraper(apiKey, params) {
  // Lazy-load so importing this module (and unit tests) never require the SDK.
  const { smartScraper } = require('scrapegraph-js');
  return smartScraper(apiKey, params);
}

/**
 * Search an Instacart-backed store via ScrapeGraphAI.
 * Resilient by design: returns [] on any failure (matching the other scrapers).
 *
 * @param {string} keyword
 * @param {string} zipCode
 * @param {{ store: string, apiKey?: string, smartScraperFn?: Function, maxResults?: number }} options
 * @returns {Promise<Array<object>>}
 */
async function searchInstacartStore(keyword, zipCode, options = {}) {
  const {
    store,
    apiKey = process.env.SCRAPEGRAPH_API_KEY,
    smartScraperFn,
    maxResults = DEFAULT_MAX_RESULTS,
  } = options;

  try {
    if (!apiKey) {
      log.warn('Missing SCRAPEGRAPH_API_KEY; cannot scrape Instacart-backed stores.');
      return [];
    }

    const url = buildInstacartUrl(store, keyword);
    if (!url) {
      log.warn(`Unknown Instacart-backed store: ${store}`);
      return [];
    }

    const scrape = smartScraperFn || defaultSmartScraper;
    const result = await scrape(apiKey, {
      website_url: url,
      user_prompt: buildExtractionPrompt(keyword, zipCode),
      output_schema: PRODUCT_OUTPUT_SCHEMA,
    });

    if (!result || result.status !== 'success') {
      log.warn(`ScrapeGraphAI returned no success for ${store}: ${(result && result.error) || 'unknown error'}`);
      return [];
    }

    const products = normalizeProducts(result.data, String(store));
    products.sort((a, b) => a.price - b.price);
    return maxResults > 0 ? products.slice(0, maxResults) : products;
  } catch (error) {
    log.error(`Instacart ScrapeGraphAI search failed for ${store}:`, error.message);
    return [];
  }
}

module.exports = {
  INSTACART_STORE_SLUGS,
  buildInstacartUrl,
  buildExtractionPrompt,
  parsePrice,
  normalizeProducts,
  searchInstacartStore,
};
