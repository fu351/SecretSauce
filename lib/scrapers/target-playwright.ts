import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { createScraperLogger } from './logger';
import he from 'he';

// Database module - will be lazy loaded when needed
let groceryStoresDB: any = null;
type StoreWithDistance = any;

// Environment variables for configuration
const TARGET_TIMEOUT_MS = Number(process.env.TARGET_TIMEOUT_MS || 30000);
const TARGET_MAX_RETRIES = Number(process.env.TARGET_MAX_RETRIES || 2);
const TARGET_RETRY_DELAY_MS = Number(process.env.TARGET_RETRY_DELAY_MS || 1000);
const TARGET_CACHE_TTL_MS = Number(process.env.TARGET_CACHE_TTL_MS || 5 * 60 * 1000);
const log = createScraperLogger('target-playwright');
const TARGET_DEBUG = log.isDebugEnabled;

function targetDebug(...args: any[]): void {
    if (TARGET_DEBUG) log.debug(...args);
}

// Browser instance management (reuse browser for efficiency)
let browserInstance: Browser | null = null;

// Store cache to avoid redundant lookups for the same ZIP code
const storeCache = new Map();

// Result cache to avoid redundant product searches
const targetResultCache = new Map();

/**
 * Get or create a browser instance
 */
async function getBrowser(): Promise<Browser> {
    if (!browserInstance) {
        targetDebug('[target-playwright] Launching new browser instance');
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
            ],
        });
    }
    return browserInstance;
}

/**
 * Close the browser instance
 */
async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        targetDebug('[target-playwright] Closing browser instance');
        await browserInstance.close();
        browserInstance = null;
    }
}

/**
 * Create a browser context with geolocation spoofing
 */
async function createContextWithLocation(
    lat: number,
    lng: number
): Promise<BrowserContext> {
    const browser = await getBrowser();

    targetDebug(`[target-playwright] Creating context with geolocation: ${lat}, ${lng}`);

    const context = await browser.newContext({
        geolocation: { latitude: lat, longitude: lng },
        permissions: ['geolocation'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
    });

    return context;
}

/**
 * Normalize keyword for consistent cache keys
 */
function normalizeKeyword(keyword: string): string {
    return String(keyword || "").trim().toLowerCase();
}

/**
 * Build cache key from keyword, lat, and lng
 */
function buildCacheKey(keyword: string, lat: number, lng: number): string {
    return `${normalizeKeyword(keyword)}::${lat.toFixed(4)}::${lng.toFixed(4)}`;
}

/**
 * Get cached result if available and not expired
 */
function getCachedResult(cacheKey: string): any[] | null {
    const cached = targetResultCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() - cached.fetchedAt > TARGET_CACHE_TTL_MS) {
        targetResultCache.delete(cacheKey);
        targetDebug(`[target-playwright] Cache expired for key: ${cacheKey}`);
        return null;
    }

    targetDebug(`[target-playwright] Cache hit for key: ${cacheKey}`);
    return cached.results;
}

/**
 * Store result in cache
 */
function setCachedResult(cacheKey: string, results: any[]): void {
    targetResultCache.set(cacheKey, {
        fetchedAt: Date.now(),
        results,
    });
    targetDebug(`[target-playwright] Cached ${results.length} results`);
}

/**
 * Get nearest Target store using geospatial database
 */
async function getNearestStore(
    location: string | { lat: number; lng: number },
    radiusMiles: number = 20
): Promise<{
    id: string;
    name: string;
    address: { line1: string; city: string; state: string; postalCode: string };
    fullAddress: string;
    lat: number;
    lng: number;
    facetedValue?: string;
    metadata?: any;
    distance_miles?: number;
} | null> {
    const cacheKey = typeof location === 'string'
        ? location
        : `${location.lat},${location.lng}`;

    // Check cache first
    if (storeCache.has(cacheKey)) {
        const cachedStore = storeCache.get(cacheKey);
        targetDebug(`[target-playwright] Using cached store ${cachedStore.id}`);
        return cachedStore;
    }

    try {
        // Lazy load database module
        if (!groceryStoresDB) {
            try {
                const dbModule = await import('../database/grocery-stores-db.js');
                groceryStoresDB = dbModule.groceryStoresDB;
                targetDebug('[target-playwright] Database module loaded');
            } catch (error: any) {
                targetDebug(`[target-playwright] Database module not available: ${error.message}`);
                return null;
            }
        }

        let store: StoreWithDistance | null = null;

        // Case 1: Lat/Lng provided - use spatial query
        if (typeof location === 'object' && 'lat' in location && 'lng' in location) {
            targetDebug(`[target-playwright] Finding store at: ${location.lat}, ${location.lng}`);
            store = await groceryStoresDB.findClosest(
                location.lat,
                location.lng,
                'target',
                radiusMiles
            );
        }
        // Case 2: ZIP code provided
        else if (typeof location === 'string') {
            const zipCode = location;
            targetDebug(`[target-playwright] Finding store by ZIP: ${zipCode}`);

            const storesByZip = await groceryStoresDB.findByStoreAndZip('target', zipCode);
            if (storesByZip.length > 0) {
                store = {
                    ...storesByZip[0],
                    lat: storesByZip[0].lat || 0,
                    lng: storesByZip[0].lng || 0,
                    distance_meters: 0,
                    distance_miles: 0,
                } as StoreWithDistance;
            }
        }

        if (!store) {
            log.warn(`[target-playwright] No stores found in database within ${radiusMiles} miles`);
            return null;
        }

        // Extract store information
        const storeId = store.metadata?.targetStoreId || store.id;
        const facetedValue = store.metadata?.facetedValue;

        const storeInfo = {
            id: storeId,
            name: store.name,
            address: {
                line1: store.address || '',
                city: '',
                state: '',
                postalCode: store.zip_code,
            },
            fullAddress: store.address || '',
            lat: store.lat,
            lng: store.lng,
            facetedValue,
            metadata: store.metadata,
            distance_miles: store.distance_miles,
        };

        targetDebug(`[target-playwright] Found store:`, {
            id: storeId,
            name: store.name,
            lat: store.lat,
            lng: store.lng,
        });

        // Cache the result
        storeCache.set(cacheKey, storeInfo);

        return storeInfo;

    } catch (error: any) {
        log.error(`[target-playwright] Error querying store: ${error.message}`);
        return null;
    }
}

/**
 * Search for products on Target using Playwright with geolocation spoofing
 */
async function getTargetProducts(
    keyword: string,
    location: { lat: number; lng: number } | string,
    options: {
        maxProducts?: number;
        sortBy?: string;
    } = {}
): Promise<any[]> {
    const { maxProducts = 10, sortBy = 'price' } = options;

    let storeInfo: any = null;
    let lat: number;
    let lng: number;

    // Resolve location to lat/lng
    if (typeof location === 'string') {
        // ZIP code - look up in database
        storeInfo = await getNearestStore(location);
        if (!storeInfo) {
            log.warn(`[target-playwright] Could not find store for ZIP: ${location}`);
            return [];
        }
        lat = storeInfo.lat;
        lng = storeInfo.lng;
    } else {
        // Direct lat/lng
        lat = location.lat;
        lng = location.lng;
        storeInfo = await getNearestStore(location);
    }

    // Check if we have valid coordinates
    if (!lat || !lng) {
        log.error('[target-playwright] Invalid coordinates');
        return [];
    }

    // Check cache
    const cacheKey = buildCacheKey(keyword, lat, lng);
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
        // Create browser context with spoofed geolocation
        context = await createContextWithLocation(lat, lng);
        page = await context.newPage();

        // Set longer timeout for navigation
        page.setDefaultTimeout(TARGET_TIMEOUT_MS);

        targetDebug(`[target-playwright] Navigating to Target with keyword: ${keyword}`);

        // Navigate to Target search page
        const searchUrl = `https://www.target.com/s?searchTerm=${encodeURIComponent(keyword)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

        // Wait for products to load
        try {
            await page.waitForSelector('[data-test="product-details"]', { timeout: 10000 });
        } catch (error) {
            targetDebug('[target-playwright] No products found or page structure changed');
            return [];
        }

        // Extract product data
        const products = await page.evaluate((maxCount) => {
            const productElements = document.querySelectorAll('[data-test="product-details"]');
            const results: any[] = [];

            for (let i = 0; i < Math.min(productElements.length, maxCount); i++) {
                const element = productElements[i];

                try {
                    // Extract product name
                    const titleElement = element.querySelector('[data-test="product-title"]');
                    const title = titleElement?.textContent?.trim() || '';

                    // Extract price
                    const priceElement = element.querySelector('[data-test="current-price"]');
                    const priceText = priceElement?.textContent?.trim() || '';
                    const priceMatch = priceText.match(/\$?([\d.]+)/);
                    const price = priceMatch ? parseFloat(priceMatch[1]) : null;

                    // Extract brand
                    const brandElement = element.querySelector('[data-test="product-brand"]');
                    const brand = brandElement?.textContent?.trim() || '';

                    // Extract image
                    const imageElement = element.querySelector('img');
                    const imageUrl = imageElement?.src || '';

                    // Extract product ID
                    const linkElement = element.querySelector('a[href*="/p/"]');
                    const href = linkElement?.getAttribute('href') || '';
                    const productIdMatch = href.match(/\/A-(\d+)/);
                    const productId = productIdMatch ? productIdMatch[1] : '';

                    if (title && price !== null) {
                        results.push({
                            product_name: title,
                            title,
                            brand,
                            price,
                            pricePerUnit: '',
                            unit: '',
                            provider: 'Target',
                            image_url: imageUrl,
                            category: '',
                            product_id: productId,
                            id: productId,
                        });
                    }
                } catch (error) {
                    console.error('Error extracting product:', error);
                }
            }

            return results;
        }, maxProducts);

        targetDebug(`[target-playwright] Extracted ${products.length} products`);

        // Add location information
        const locationLabel = storeInfo?.fullAddress || `${lat}, ${lng}`;
        const enrichedProducts = products.map(product => ({
            ...product,
            location: locationLabel,
            target_store_id: storeInfo?.id || '',
            geolocation: { lat, lng },
        }));

        // Sort by price
        enrichedProducts.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

        // Cache results
        setCachedResult(cacheKey, enrichedProducts);

        return enrichedProducts;

    } catch (error: any) {
        log.error(`[target-playwright] Error scraping: ${error.message}`);
        return [];
    } finally {
        // Clean up
        if (page) await page.close();
        if (context) await context.close();
    }
}

/**
 * Search products across multiple store locations
 */
async function searchMultipleLocations(
    keyword: string,
    locations: Array<{ lat: number; lng: number } | string>,
    options: {
        maxProducts?: number;
        sortBy?: string;
    } = {}
): Promise<Map<string, any[]>> {
    const results = new Map<string, any[]>();

    for (const location of locations) {
        const locationKey = typeof location === 'string'
            ? location
            : `${location.lat},${location.lng}`;

        targetDebug(`[target-playwright] Searching at location: ${locationKey}`);

        const products = await getTargetProducts(keyword, location, options);
        results.set(locationKey, products);

        // Small delay between locations to be respectful
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return results;
}

// Export functions
export {
    getTargetProducts,
    getNearestStore,
    searchMultipleLocations,
    closeBrowser,
};
