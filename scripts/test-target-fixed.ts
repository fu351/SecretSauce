#!/usr/bin/env node

/**
 * Test the fixed Target scraper with database geospatial integration
 *
 * Usage:
 *   npx tsx scripts/test-target-fixed.ts
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

async function testTargetScraper() {
    console.log('🎯 Testing Fixed Target Scraper\n');
    console.log('='.repeat(70));

    // Import the scraper
    const { getTargetProducts, getNearestStore } = await import('../lib/scrapers/target.ts');

    // Test with a ZIP code
    const testZip = '94704'; // Berkeley, CA
    const searchTerm = 'eggs';

    console.log(`\n📍 Test: Searching for "${searchTerm}" in ZIP ${testZip}`);
    console.log('   This should:');
    console.log('   1. Query database for Target store in ZIP 94704');
    console.log('   2. Extract lat/lng from PostGIS geometry');
    console.log('   3. Use coordinates to get Berkeley-specific prices\n');

    try {
        // Step 1: Get nearest store
        console.log('Step 1: Looking up store in database...');
        const store = await getNearestStore(testZip);

        if (!store) {
            console.log('❌ No store found in database for ZIP', testZip);
            console.log('   Make sure your database has Target stores populated.');
            console.log('   Falling back to Target API...\n');
        } else {
            console.log('✅ Store found:');
            console.log(`   ID: ${store.id}`);
            console.log(`   Name: ${store.name}`);
            console.log(`   Address: ${store.fullAddress}`);
            console.log(`   Coordinates: ${store.lat}, ${store.lng}`);
            console.log(`   Distance: ${store.distance_miles?.toFixed(2) || 0} miles\n`);

            if (!store.lat || !store.lng || (store.lat === 0 && store.lng === 0)) {
                console.log('⚠️  WARNING: Store has no coordinates!');
                console.log('   This means the database query didn\'t extract lat/lng.');
                console.log('   Did you apply the migration? Run: supabase db push\n');
            }
        }

        // Step 2: Search for products
        console.log('Step 2: Searching for products...');
        const products = await getTargetProducts(searchTerm, store, testZip);

        if (products.length === 0) {
            console.log('❌ No products found');
            console.log('   This could mean:');
            console.log('   - Target API is not responding');
            console.log('   - Store ID is invalid');
            console.log('   - Target changed their API');
        } else {
            console.log(`✅ Found ${products.length} products:\n`);

            products.slice(0, 5).forEach((product, i) => {
                console.log(`${i + 1}. ${product.product_name}`);
                console.log(`   Price: $${product.price}`);
                console.log(`   Brand: ${product.brand}`);
                console.log(`   Store: ${product.location}`);
                console.log('');
            });

            if (products.length > 5) {
                console.log(`   ... and ${products.length - 5} more products\n`);
            }
        }

        console.log('='.repeat(70));
        console.log('✅ Test completed!\n');

    } catch (error: any) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
testTargetScraper()
    .then(() => {
        console.log('Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
