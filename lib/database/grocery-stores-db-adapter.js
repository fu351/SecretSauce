/**
 * JavaScript adapter for grocery-stores-db TypeScript module
 * Provides CommonJS-compatible exports for use in Node.js scripts
 */

// Dynamic import for TypeScript module
let groceryStoresDB = null;

/**
 * Initialize the database adapter
 * Must be called before using any database functions
 */
async function initDB() {
    if (!groceryStoresDB) {
        const module = await import('./grocery-stores-db.js');
        groceryStoresDB = module.groceryStoresDB;
    }
    return groceryStoresDB;
}

/**
 * Find nearest store of a specific brand
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} storeEnum - Store brand (e.g., 'target')
 * @param {number} radiusMiles - Search radius in miles
 * @returns {Promise<Object|null>} Store with distance data
 */
async function findClosest(lat, lng, storeEnum, radiusMiles = 10) {
    const db = await initDB();
    return db.findClosest(lat, lng, storeEnum, radiusMiles);
}

/**
 * Find stores by store enum and ZIP code
 * @param {string} storeEnum - Store brand (e.g., 'target')
 * @param {string} zipCode - ZIP code to search
 * @returns {Promise<Array>} Array of matching stores
 */
async function findByStoreAndZip(storeEnum, zipCode) {
    const db = await initDB();
    return db.findByStoreAndZip(storeEnum, zipCode);
}

/**
 * Find stores within radius of coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMiles - Search radius in miles
 * @param {string} storeEnum - Optional store brand filter
 * @returns {Promise<Array>} Array of stores with distance data
 */
async function findNearby(lat, lng, radiusMiles = 10, storeEnum = null) {
    const db = await initDB();
    return db.findNearby(lat, lng, radiusMiles, storeEnum);
}

module.exports = {
    initDB,
    findClosest,
    findByStoreAndZip,
    findNearby,
};
