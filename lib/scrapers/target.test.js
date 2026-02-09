/**
 * Test suite for Target scraper
 * Run with: node lib/scrapers/target.test.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { getTargetProducts } = require('./target');

// Test cases
const testCases = [
    { keyword: 'milk', zipCode: '47906', expectedMin: 5, description: 'Common grocery item' },
    { keyword: 'chicken breast', zipCode: '47906', expectedMin: 3, description: 'Multi-word search' },
    { keyword: 'bananas', zipCode: '47906', expectedMin: 2, description: 'Single item search' },
    { keyword: 'organic eggs', zipCode: '47906', expectedMin: 2, description: 'Specific product type' },
];

async function runTests() {
    console.log('\n' + '='.repeat(80));
    console.log('TARGET SCRAPER TEST SUITE');
    console.log('='.repeat(80));

    let passed = 0;
    let failed = 0;
    const issues = [];

    for (const testCase of testCases) {
        console.log(`\n📋 Testing: "${testCase.keyword}" (${testCase.description})`);
        console.log('-'.repeat(80));

        try {
            const results = await getTargetProducts(testCase.keyword, null, testCase.zipCode);

            // Test 1: Results exist
            if (!results || results.length === 0) {
                failed++;
                issues.push(`❌ "${testCase.keyword}": No results returned`);
                console.log(`   ❌ FAILED: No results returned`);
                continue;
            }

            console.log(`   ✅ Found ${results.length} results`);

            // Test 2: Minimum results
            if (results.length < testCase.expectedMin) {
                failed++;
                issues.push(`⚠️  "${testCase.keyword}": Only ${results.length} results (expected at least ${testCase.expectedMin})`);
                console.log(`   ⚠️  WARNING: Only ${results.length} results (expected at least ${testCase.expectedMin})`);
            } else {
                console.log(`   ✅ Has at least ${testCase.expectedMin} results`);
            }

            // Test 3: Check for duplicates
            const productIds = results.map(r => r.product_id || r.id).filter(Boolean);
            const uniqueIds = new Set(productIds);
            if (productIds.length !== uniqueIds.size) {
                failed++;
                const duplicates = productIds.length - uniqueIds.size;
                issues.push(`❌ "${testCase.keyword}": ${duplicates} duplicate product(s) found`);
                console.log(`   ❌ FAILED: ${duplicates} duplicate product(s) found`);
            } else {
                console.log(`   ✅ No duplicates`);
            }

            // Test 4: All products have required fields
            const missingFields = [];
            results.forEach((product, index) => {
                if (!product.title && !product.product_name) missingFields.push(`[${index}] missing title`);
                if (product.price === null || product.price === undefined) missingFields.push(`[${index}] missing price`);
                if (!product.provider) missingFields.push(`[${index}] missing provider`);
                if (!product.location) missingFields.push(`[${index}] missing location`);
            });

            if (missingFields.length > 0) {
                failed++;
                issues.push(`❌ "${testCase.keyword}": Missing fields: ${missingFields.join(', ')}`);
                console.log(`   ❌ FAILED: Missing required fields`);
                missingFields.forEach(f => console.log(`      - ${f}`));
            } else {
                console.log(`   ✅ All products have required fields`);
            }

            // Test 5: Check relevance (products should contain keyword in title)
            const keywordLower = testCase.keyword.toLowerCase();
            const irrelevant = results.filter(p => {
                const title = (p.title || p.product_name || '').toLowerCase();
                return !title.includes(keywordLower);
            });

            if (irrelevant.length > 0) {
                failed++;
                issues.push(`⚠️  "${testCase.keyword}": ${irrelevant.length} irrelevant result(s) (don't contain keyword)`);
                console.log(`   ⚠️  WARNING: ${irrelevant.length} irrelevant result(s):`);
                irrelevant.slice(0, 3).forEach(p => {
                    console.log(`      - "${(p.title || p.product_name || '').substring(0, 60)}..."`);
                });
            } else {
                console.log(`   ✅ All results contain keyword`);
            }

            // Test 6: Check price quality
            const invalidPrices = results.filter(p => {
                return p.price === null || p.price === undefined || p.price <= 0 || p.price > 10000;
            });

            if (invalidPrices.length > 0) {
                failed++;
                issues.push(`⚠️  "${testCase.keyword}": ${invalidPrices.length} product(s) with invalid prices`);
                console.log(`   ⚠️  WARNING: ${invalidPrices.length} product(s) with invalid prices`);
            } else {
                console.log(`   ✅ All prices are valid`);
            }

            // Test 7: Results are sorted by price (ascending)
            let isSorted = true;
            for (let i = 1; i < results.length; i++) {
                if (results[i-1].price > results[i].price) {
                    isSorted = false;
                    break;
                }
            }

            if (!isSorted) {
                failed++;
                issues.push(`⚠️  "${testCase.keyword}": Results are not sorted by price`);
                console.log(`   ⚠️  WARNING: Results are not sorted by price`);
            } else {
                console.log(`   ✅ Results are sorted by price`);
            }

            // Test 8: Check for empty pricePerUnit/unit (should have values when applicable)
            const missingUnitInfo = results.filter(p => {
                // Some products legitimately don't have unit pricing (e.g., "each" items)
                // But if pricePerUnit is empty string, that's suspicious
                return p.pricePerUnit === '' && p.unit === '' && p.price > 0;
            });

            if (missingUnitInfo.length > 0) {
                console.log(`   ⚠️  INFO: ${missingUnitInfo.length} product(s) missing unit pricing info`);
            }

            passed++;

        } catch (error) {
            failed++;
            issues.push(`❌ "${testCase.keyword}": Error - ${error.message}`);
            console.log(`   ❌ FAILED: ${error.message}`);
            if (error.stack) {
                console.log(`   Stack: ${error.stack.split('\n')[1]}`);
            }
        }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total Tests: ${testCases.length}`);

    if (issues.length > 0) {
        console.log('\n📋 ISSUES FOUND:');
        issues.forEach(issue => console.log(`   ${issue}`));
    }

    console.log('\n');
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
