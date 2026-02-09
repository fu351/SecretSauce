#!/usr/bin/env node

/**
 * Test script for Target Playwright scraper with geolocation spoofing
 *
 * Usage:
 *   npx tsx scripts/test-target-playwright.ts
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

async function testPlaywrightScraper() {
    console.log('🎭 Testing Target Playwright Scraper with Geolocation Spoofing\n');
    console.log('='.repeat(70));

    // Dynamic import
    const targetModule = await import('../lib/scrapers/target-playwright.ts');
    const { getTargetProducts, searchMultipleLocations, closeBrowser } = targetModule;

    try {
        // Test 1: Search with specific coordinates (Berkeley, CA)
        console.log('\n📍 Test 1: Searching with Berkeley, CA coordinates');
        console.log('   Location: 37.8715, -122.2730');
        console.log('   Browser will think it\'s physically located there!\n');

        const berkeleyProducts = await getTargetProducts(
            'eggs',
            { lat: 37.8715, lng: -122.2730 },
            { maxProducts: 5 }
        );

        if (berkeleyProducts.length > 0) {
            console.log(`✅ Found ${berkeleyProducts.length} products:\n`);
            berkeleyProducts.forEach((product, i) => {
                console.log(`   ${i + 1}. ${product.product_name}`);
                console.log(`      Price: $${product.price}`);
                console.log(`      Brand: ${product.brand}`);
                console.log(`      Location: ${product.location}`);
                console.log('');
            });
        } else {
            console.log('⚠️  No products found');
        }

        // Test 2: Search with ZIP code (will look up coordinates from database)
        console.log('\n📍 Test 2: Searching with ZIP code lookup');
        console.log('   ZIP: 94704 (Berkeley)');
        console.log('   Will query database for store coordinates, then spoof location\n');

        const zipProducts = await getTargetProducts('milk', '94704', { maxProducts: 3 });

        if (zipProducts.length > 0) {
            console.log(`✅ Found ${zipProducts.length} products:\n`);
            zipProducts.forEach((product, i) => {
                console.log(`   ${i + 1}. ${product.product_name}`);
                console.log(`      Price: $${product.price}`);
                console.log(`      Geolocation: ${product.geolocation.lat}, ${product.geolocation.lng}`);
                console.log('');
            });
        } else {
            console.log('⚠️  No products found (database might not have this ZIP code)');
        }

        // Test 3: Search multiple locations
        console.log('\n📍 Test 3: Comparing prices across multiple locations');
        console.log('   Locations: Berkeley, San Francisco, Los Angeles\n');

        const multiLocationResults = await searchMultipleLocations(
            'bread',
            [
                { lat: 37.8715, lng: -122.2730 },  // Berkeley
                { lat: 37.7749, lng: -122.4194 },  // San Francisco
                { lat: 34.0522, lng: -118.2437 },  // Los Angeles
            ],
            { maxProducts: 2 }
        );

        multiLocationResults.forEach((products, location) => {
            console.log(`\n   📍 ${location}:`);
            if (products.length > 0) {
                products.forEach((product, i) => {
                    console.log(`      ${i + 1}. ${product.product_name} - $${product.price}`);
                });
            } else {
                console.log('      No products found');
            }
        });

        console.log('\n' + '='.repeat(70));
        console.log('✅ All tests completed!\n');

        console.log('🎯 How it works:');
        console.log('   1. Browser context is created with geolocation override');
        console.log('   2. Target\'s website receives location data from the browser');
        console.log('   3. Prices shown are specific to that geographic location');
        console.log('   4. You can compare prices across different cities/stores\n');

        console.log('💡 Benefits:');
        console.log('   ✅ See actual location-specific pricing');
        console.log('   ✅ Compare prices across different regions');
        console.log('   ✅ No need to physically travel or use VPN');
        console.log('   ✅ Automated price monitoring for multiple locations\n');

    } catch (error: any) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        // Always close the browser
        console.log('🧹 Cleaning up browser instance...');
        await closeBrowser();
        console.log('Done!\n');
    }
}

// Run the test
testPlaywrightScraper()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });

export { testPlaywrightScraper };
