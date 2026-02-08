#!/usr/bin/env node

/**
 * Test script for Target scraper with geospatial database integration
 *
 * Usage:
 *   npx tsx scripts/test-target-geospatial.ts
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

async function testGeospatialIntegration() {
    // Dynamic import avoids CJS/ESM named export interop issues under tsx.
    const targetModule = await import('../lib/scrapers/target.ts');
    const { getNearestStore, getTargetProducts } = ((targetModule as any).default ?? targetModule) as {
        getNearestStore: (location: string | { lat: number; lng: number }, radiusMiles?: number) => Promise<any>;
        getTargetProducts: (keyword: string, storeMetadata?: any, zipCode?: string, sortBy?: string) => Promise<any[]>;
    };

    console.log('🧪 Testing Target Scraper with Geospatial Database\n');
    console.log('=' .repeat(70));

    // Test 1: Find store by ZIP code
    console.log('\n📍 Test 1: Finding store by ZIP code (94704)');
    const storeByZip = await getNearestStore('94704');

    if (storeByZip) {
        console.log('✅ Store found:');
        console.log(`   ID: ${storeByZip.id}`);
        console.log(`   Name: ${storeByZip.name}`);
        console.log(`   Address: ${storeByZip.fullAddress}`);
        console.log(`   Faceted Value: ${storeByZip.facetedValue || 'Not set'}`);
        if (storeByZip.distance_miles) {
            console.log(`   Distance: ${storeByZip.distance_miles.toFixed(2)} miles`);
        }
    } else {
        console.log('⚠️  No store found (will use Target API fallback)');
    }

    // Test 2: Find store by lat/lng coordinates (Berkeley, CA)
    console.log('\n📍 Test 2: Finding store by coordinates (37.8715, -122.2730)');
    const storeByCoords = await getNearestStore({ lat: 37.8715, lng: -122.2730 });

    if (storeByCoords) {
        console.log('✅ Store found:');
        console.log(`   ID: ${storeByCoords.id}`);
        console.log(`   Name: ${storeByCoords.name}`);
        console.log(`   Address: ${storeByCoords.fullAddress}`);
        console.log(`   Faceted Value: ${storeByCoords.facetedValue || 'Not set'}`);
        if (storeByCoords.distance_miles !== undefined) {
            console.log(`   Distance: ${storeByCoords.distance_miles.toFixed(2)} miles`);
        }
    } else {
        console.log('⚠️  No store found');
    }

    // Test 3: Search for products with geospatial store data
    if (storeByZip) {
        console.log('\n🛒 Test 3: Searching for products using geospatial store data');
        console.log(`   Store: ${storeByZip.name}`);
        console.log(`   Using faceted value: ${storeByZip.facetedValue ? 'Yes ✅' : 'No (using storeId)'}`);

        const products = await getTargetProducts('eggs', storeByZip, '94704');

        if (products && products.length > 0) {
            console.log(`\n✅ Found ${products.length} products:`);
            products.slice(0, 3).forEach((product, i) => {
                console.log(`\n   ${i + 1}. ${product.product_name}`);
                console.log(`      Price: $${product.price}`);
                console.log(`      Brand: ${product.brand}`);
                console.log(`      Store: ${product.location}`);
            });
        } else {
            console.log('⚠️  No products found');
        }
    }

    console.log('\n' + '=' .repeat(70));
    console.log('✅ Test completed!\n');

    // Show benefits of geospatial integration
    console.log('📊 Benefits of Geospatial Integration:');
    console.log('   • Uses PostGIS spatial queries for accurate distance calculations');
    console.log('   • Leverages facetedValue for precise store-level pricing');
    console.log('   • Reduces API calls by using local database');
    console.log('   • Supports both ZIP code and lat/lng coordinate searches');
    console.log('   • Fallback to Target API when database has no data\n');
}

// Run the test when executed directly (ESM-compatible)
const isDirectExecution = process.argv[1]
    ? fileURLToPath(import.meta.url) === process.argv[1]
    : false;

if (isDirectExecution) {
    testGeospatialIntegration()
        .then(() => {
            console.log('Done!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Test failed:', error);
            console.error(error.stack);
            process.exit(1);
        });
}

export { testGeospatialIntegration };
