/**
 * Test script to run each scraper individually with verbose output
 * Usage: node test-scrapers.js <searchTerm> <zipCode> [storeName]
 *
 * Examples:
 *   node test-scrapers.js "milk" "47906"           - Test all scrapers
 *   node test-scrapers.js "milk" "47906" "target"  - Test only Target
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const axios = require('axios');

// Import scrapers
const { getTargetProducts } = require('./target');
const { Krogers } = require('./kroger');
const { Meijers, getLocations } = require('./meijer');
const { search99Ranch } = require('./99ranch');
const { searchWalmartWithExa, searchWalmartAPI } = require('./walmart');
const { searchTraderJoes } = require('./traderjoes');
const { searchAldi } = require('./aldi');

// Store location testing functions - these make the raw API calls to see full response
async function testTargetStoreLocation(zipCode) {
    console.log('\n' + '='.repeat(80));
    console.log('TARGET - Store Location API Response');
    console.log('='.repeat(80));

    const baseUrl = "https://redsky.target.com/redsky_aggregations/v1/web/nearby_stores_v1";
    const params = {
        key: "9f36aeafbe60771e321a7cc95a78140772ab3e96",
        channel: "WEB",
        limit: 2,
        within: 20,
        place: encodeURIComponent(zipCode),
        is_bot: false,
    };
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
    };

    try {
        const response = await axios.get(baseUrl, { params, headers, timeout: 10000 });
        console.log('\n📍 RAW API RESPONSE:');
        console.log(JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

async function testKrogerStoreLocation(zipCode) {
    console.log('\n' + '='.repeat(80));
    console.log('KROGER - Store Location API Response');
    console.log('='.repeat(80));

    const CLIENT_ID = "shopsage-243261243034246d665a464b4d485545587677665835526a74466a2f2e704b6d6c4d4e43702f7758624341476a6d497947637268486441527250624f2908504214587086555";
    const CLIENT_SECRET = "ZoCeBUn1HvoveqtZQA4h1ji4wFh_dpe3uWLynFiO";

    try {
        // Get auth token
        const tokenResponse = await axios.post(
            "https://api.kroger.com/v1/connect/oauth2/token",
            "grant_type=client_credentials&scope=product.compact",
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "Authorization": "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
                },
                timeout: 10000
            }
        );

        const token = tokenResponse.data.access_token;

        // Get location
        const locationResponse = await axios.get(
            `https://api.kroger.com/v1/locations?filter.zipCode.near=${zipCode}`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 10000
            }
        );

        console.log('\n📍 RAW API RESPONSE:');
        console.log(JSON.stringify(locationResponse.data, null, 2));
        return locationResponse.data;
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

async function testMeijerStoreLocation(zipCode) {
    console.log('\n' + '='.repeat(80));
    console.log('MEIJER - Store Location API Response');
    console.log('='.repeat(80));

    try {
        const url = `https://www.meijer.com/bin/meijer/store/search?locationQuery=${zipCode}&radius=20`;
        const response = await axios.get(url, {
            headers: {
                'accept': 'application/json, text/plain, */*',
                'referer': 'https://www.meijer.com/shopping/store-finder.html',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        console.log('\n📍 RAW API RESPONSE:');
        console.log(JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

async function test99RanchStoreLocation(zipCode) {
    console.log('\n' + '='.repeat(80));
    console.log('99 RANCH - Store Location API Response');
    console.log('='.repeat(80));

    try {
        const response = await axios.post(
            "https://www.99ranch.com/be-api/store/web/nearby/stores",
            {
                zipCode: zipCode,
                pageSize: 1,
                pageNum: 1,
                type: 1,
                source: "WEB",
                within: null
            },
            {
                headers: {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "lang": "en_US",
                    "time-zone": "America/Los_Angeles",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                timeout: 10000
            }
        );

        console.log('\n📍 RAW API RESPONSE:');
        console.log(JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

// Product search tests
async function testScraperProducts(storeName, searchTerm, zipCode) {
    console.log('\n' + '-'.repeat(80));
    console.log(`${storeName.toUpperCase()} - Product Search Results`);
    console.log('-'.repeat(80));

    try {
        let products = [];

        switch(storeName.toLowerCase()) {
            case 'target':
                products = await getTargetProducts(searchTerm, null, zipCode);
                break;
            case 'kroger':
                products = await Krogers(zipCode, searchTerm);
                break;
            case 'meijer':
                products = await Meijers(zipCode, searchTerm);
                break;
            case '99ranch':
                products = await search99Ranch(searchTerm, zipCode);
                break;
            case 'walmart':
                // Try direct first, then Exa fallback
                const { searchWalmartDirect } = require('./walmart');
                if (typeof searchWalmartDirect === 'function') {
                    products = await searchWalmartDirect(searchTerm, zipCode);
                }
                if (!products || products.length === 0) {
                    products = await searchWalmartAPI(searchTerm, zipCode);
                }
                break;
            case 'traderjoes':
                products = await searchTraderJoes(searchTerm, zipCode);
                break;
            case 'aldi':
                products = await searchAldi(searchTerm, zipCode);
                break;
            default:
                console.log(`Unknown store: ${storeName}`);
                return [];
        }

        console.log(`\n📦 Found ${products.length} products`);
        if (products.length > 0) {
            console.log('\n📋 FULL PRODUCT JSON (first result):');
            console.log(JSON.stringify(products[0], null, 2));

            console.log('\n📋 ALL PRODUCTS LOCATION FIELDS:');
            products.forEach((p, i) => {
                console.log(`  ${i + 1}. ${p.title?.substring(0, 40)}... → location: "${p.location}"`);
            });
        }

        return products;
    } catch (error) {
        console.error('❌ Error:', error.message);
        return [];
    }
}

async function main() {
    const searchTerm = process.argv[2] || 'milk';
    const zipCode = process.argv[3] || '47906';
    const specificStore = process.argv[4]?.toLowerCase();

    console.log('\n' + '█'.repeat(80));
    console.log('SCRAPER STORE LOCATION & PRODUCT ANALYSIS');
    console.log('█'.repeat(80));
    console.log(`Search Term: ${searchTerm}`);
    console.log(`Zip Code: ${zipCode}`);
    console.log(`Specific Store: ${specificStore || 'ALL'}`);
    console.log('█'.repeat(80));

    const allStores = ['target', 'kroger', 'meijer', '99ranch', 'walmart', 'traderjoes', 'aldi'];
    const storesToTest = specificStore ? [specificStore] : allStores;

    for (const store of storesToTest) {
        console.log('\n\n' + '▓'.repeat(80));
        console.log(`TESTING: ${store.toUpperCase()}`);
        console.log('▓'.repeat(80));

        // Test store location API for stores that have it
        switch(store) {
            case 'target':
                await testTargetStoreLocation(zipCode);
                break;
            case 'kroger':
                await testKrogerStoreLocation(zipCode);
                break;
            case 'meijer':
                await testMeijerStoreLocation(zipCode);
                break;
            case '99ranch':
                await test99RanchStoreLocation(zipCode);
                break;
            case 'walmart':
                console.log('\n⚠️  Walmart does not have a store location API');
                console.log('Products will have hardcoded location: "Walmart Store"');
                break;
            case 'traderjoes':
                console.log('\n⚠️  Trader Joe\'s does not have a store location API');
                console.log('Products will have hardcoded location: "Trader Joe\'s Store"');
                break;
            case 'aldi':
                console.log('\n⚠️  Aldi does not have a store location API');
                console.log('Products will have hardcoded location: "Aldi Store"');
                break;
        }

        // Test product search
        await testScraperProducts(store, searchTerm, zipCode);
    }

    console.log('\n\n' + '█'.repeat(80));
    console.log('ANALYSIS COMPLETE');
    console.log('█'.repeat(80));
    console.log('\nStores WITH store location APIs (have address data):');
    console.log('  - Target: ✅ Has store ID, address, city, state, zip');
    console.log('  - Kroger: ✅ Has locationId, name, address');
    console.log('  - Meijer: ✅ Has storeNumber, city, state, zip');
    console.log('  - 99 Ranch: ✅ Has id, name, address, city, state, zip');
    console.log('\nStores WITHOUT store location APIs:');
    console.log('  - Walmart: ❌ Hardcoded "Walmart Store"');
    console.log('  - Trader Joe\'s: ❌ Hardcoded "Trader Joe\'s Store"');
    console.log('  - Aldi: ❌ Hardcoded "Aldi Store"');
    console.log('\n');
}

main().catch(console.error);
