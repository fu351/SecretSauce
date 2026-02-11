/**
 * Test suite for Target scraper
 * Run with: node lib/scrapers/target.test.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const axios = require('axios');

const ENABLE_REQUEST_TRACE = process.env.TARGET_TEST_TRACE !== 'false';
const ENABLE_ANTI_BOT_PROBE = process.env.TARGET_TEST_ANTI_BOT !== 'false';
const ANTI_BOT_FAIL_ON_SIGNAL = process.env.TARGET_TEST_ANTI_BOT_FAIL_ON_SIGNAL === 'true';
const ANTI_BOT_SERIAL_REQUESTS = readIntEnv('TARGET_TEST_ANTI_BOT_SERIAL', 8, 1);
const ANTI_BOT_BURST_CONCURRENCY = readIntEnv('TARGET_TEST_ANTI_BOT_BURST_CONCURRENCY', 5, 1);
const ANTI_BOT_BURST_ROUNDS = readIntEnv('TARGET_TEST_ANTI_BOT_BURST_ROUNDS', 2, 1);
const ANTI_BOT_DELAY_MS = readIntEnv('TARGET_TEST_ANTI_BOT_DELAY_MS', 150, 0);
const ANTI_BOT_KEYWORDS = parseKeywordCsv(
    process.env.TARGET_TEST_ANTI_BOT_KEYWORDS,
    ['milk', 'banana', 'bread', 'bacon', 'eggs']
);
const requestTraces = [];

function readIntEnv(name, fallback, minValue = 0) {
    const parsed = Number.parseInt(process.env[name] || '', 10);
    if (Number.isFinite(parsed) && parsed >= minValue) {
        return parsed;
    }
    return fallback;
}

function parseKeywordCsv(value, fallback) {
    if (!value) return fallback;
    const keywords = String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    return keywords.length > 0 ? keywords : fallback;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

if (ENABLE_REQUEST_TRACE) {
    const originalAxiosGet = axios.get.bind(axios);

    axios.get = async function tracedAxiosGet(url, config = {}) {
        const isTargetPlpRequest = typeof url === 'string' && url.includes('/plp_search_v2');
        const params = config?.params || {};
        const snapshot = isTargetPlpRequest
            ? {
                at: new Date().toISOString(),
                url,
                keyword: params.keyword ?? null,
                zip: params.zip ?? null,
                pricing_store_id: params.pricing_store_id ?? null,
                store_ids: params.store_ids ?? null,
                page: params.page ?? null,
                channel: params.channel ?? null,
                has_visitor_id: Boolean(params.visitor_id),
                has_key: Boolean(params.key),
            }
            : null;

        try {
            const response = await originalAxiosGet(url, config);
            if (snapshot) {
                requestTraces.push({
                    ...snapshot,
                    status: response?.status ?? null,
                    outcome: response?.status === 200 ? 'success' : 'non_200',
                });
            }
            return response;
        } catch (error) {
            if (snapshot) {
                requestTraces.push({
                    ...snapshot,
                    status: error?.response?.status ?? null,
                    outcome: 'error',
                    error_code: error?.code ?? null,
                    error_message: error?.message ?? null,
                });
            }
            throw error;
        }
    };
}

const { getTargetProducts } = require('./target');

const TEST_ZIP_CODE = process.env.TARGET_TEST_ZIP || process.argv[2] || '94704';

// Test cases
const testCases = [
    { keyword: 'milk', zipCode: TEST_ZIP_CODE, expectedMin: 5, description: 'Common grocery item' },
    { keyword: 'chicken breast', zipCode: TEST_ZIP_CODE, expectedMin: 3, description: 'Multi-word search' },
    { keyword: 'banana', zipCode: TEST_ZIP_CODE, expectedMin: 2, description: 'Nightly-like keyword' },
    { keyword: 'bacon', zipCode: TEST_ZIP_CODE, expectedMin: 2, description: 'Nightly-like keyword' },
    { keyword: 'bread', zipCode: TEST_ZIP_CODE, expectedMin: 2, description: 'Nightly-like keyword' },
    { keyword: 'organic eggs', zipCode: TEST_ZIP_CODE, expectedMin: 2, description: 'Specific product type' },
];

async function runTests() {
    console.log('\n' + '='.repeat(80));
    console.log('TARGET SCRAPER TEST SUITE');
    console.log('='.repeat(80));
    console.log(`ZIP Code: ${TEST_ZIP_CODE}`);

    let passed = 0;
    let failed = 0;
    let antiBotProbeFailed = false;
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

    if (ENABLE_REQUEST_TRACE) {
        const successfulCalls = requestTraces.filter(trace => trace.status === 200);
        const calls404 = requestTraces.filter(trace => trace.status === 404);

        console.log('\n' + '='.repeat(80));
        console.log('TARGET REQUEST TRACE');
        console.log('='.repeat(80));
        console.log(`Total traced PLP calls: ${requestTraces.length}`);
        console.log(`200 responses: ${successfulCalls.length}`);
        console.log(`404 responses: ${calls404.length}`);

        const printTraceSample = (label, traces) => {
            console.log(`\n${label}:`);
            if (!traces.length) {
                console.log('   (none)');
                return;
            }

            traces.slice(0, 5).forEach(trace => {
                console.log(
                    `   keyword="${trace.keyword}" zip=${trace.zip} ` +
                    `store=${trace.pricing_store_id} status=${trace.status} ` +
                    `page="${trace.page}" outcome=${trace.outcome}`
                );
            });
        };

        printTraceSample('Sample successful calls', successfulCalls);
        printTraceSample('Sample 404 calls', calls404);
    }

    if (ENABLE_ANTI_BOT_PROBE) {
        const antiBotSummary = await runAntiBotNetworkProbe(TEST_ZIP_CODE);
        if (antiBotSummary.signalDetected) {
            const signalMessage = `⚠️ Anti-bot/network probe detected transient signals: ${antiBotSummary.signals.join('; ')}`;
            issues.push(signalMessage);
            if (ANTI_BOT_FAIL_ON_SIGNAL) {
                antiBotProbeFailed = true;
            }
        }
    }

    console.log('\n');
    process.exit(failed > 0 || antiBotProbeFailed ? 1 : 0);
}

async function runAntiBotNetworkProbe(zipCode) {
    const traceStartIndex = requestTraces.length;
    const probeOutcomes = [];

    console.log('\n' + '='.repeat(80));
    console.log('ANTI-BOT / NETWORK STABILITY PROBE');
    console.log('='.repeat(80));
    console.log(`ZIP: ${zipCode}`);
    console.log(`Serial requests: ${ANTI_BOT_SERIAL_REQUESTS}`);
    console.log(`Burst: ${ANTI_BOT_BURST_ROUNDS} round(s) x ${ANTI_BOT_BURST_CONCURRENCY} concurrent requests`);

    console.log('\n🔁 Serial probe...');
    for (let i = 0; i < ANTI_BOT_SERIAL_REQUESTS; i++) {
        const baseKeyword = ANTI_BOT_KEYWORDS[i % ANTI_BOT_KEYWORDS.length];
        const keyword = `${baseKeyword} probe serial ${i + 1}`;
        const startedAt = Date.now();

        try {
            const results = await getTargetProducts(keyword, null, zipCode);
            probeOutcomes.push({
                keyword,
                phase: 'serial',
                success: true,
                resultCount: Array.isArray(results) ? results.length : 0,
                durationMs: Date.now() - startedAt,
            });
            console.log(`   ✅ ${keyword} (${Date.now() - startedAt}ms)`);
        } catch (error) {
            probeOutcomes.push({
                keyword,
                phase: 'serial',
                success: false,
                resultCount: 0,
                durationMs: Date.now() - startedAt,
                errorMessage: error?.message || String(error),
            });
            console.log(`   ❌ ${keyword} (${Date.now() - startedAt}ms): ${error?.message || String(error)}`);
        }

        if (ANTI_BOT_DELAY_MS > 0 && i < ANTI_BOT_SERIAL_REQUESTS - 1) {
            await sleep(ANTI_BOT_DELAY_MS);
        }
    }

    console.log('\n⚡ Burst probe...');
    for (let round = 0; round < ANTI_BOT_BURST_ROUNDS; round++) {
        const burstKeywords = Array.from({ length: ANTI_BOT_BURST_CONCURRENCY }, (_, idx) => {
            const baseKeyword = ANTI_BOT_KEYWORDS[(round * ANTI_BOT_BURST_CONCURRENCY + idx) % ANTI_BOT_KEYWORDS.length];
            return `${baseKeyword} probe burst ${round + 1}-${idx + 1}`;
        });

        const burstResults = await Promise.all(
            burstKeywords.map(async keyword => {
                const startedAt = Date.now();
                try {
                    const results = await getTargetProducts(keyword, null, zipCode);
                    return {
                        keyword,
                        phase: 'burst',
                        success: true,
                        resultCount: Array.isArray(results) ? results.length : 0,
                        durationMs: Date.now() - startedAt,
                    };
                } catch (error) {
                    return {
                        keyword,
                        phase: 'burst',
                        success: false,
                        resultCount: 0,
                        durationMs: Date.now() - startedAt,
                        errorMessage: error?.message || String(error),
                    };
                }
            })
        );

        probeOutcomes.push(...burstResults);
        const failedInRound = burstResults.filter(item => !item.success).length;
        console.log(`   Round ${round + 1}: ${burstResults.length - failedInRound}/${burstResults.length} succeeded`);
    }

    const probeTraces = requestTraces.slice(traceStartIndex);
    const statuses = probeTraces.map(trace => trace.status).filter(status => Number.isInteger(status));
    const statusCounts = statuses.reduce((acc, status) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    const traceErrors = probeTraces.filter(trace => trace.outcome === 'error');
    const http429 = statusCounts[429] || 0;
    const http403 = statusCounts[403] || 0;
    const http404 = statusCounts[404] || 0;
    const http5xx = statuses.filter(status => status >= 500).length;
    const networkErrors = traceErrors.filter(trace => !Number.isInteger(trace.status)).length;

    const signals = [];
    if (http429 > 0) signals.push(`HTTP 429 rate limiting (${http429})`);
    if (http403 > 0) signals.push(`HTTP 403 blocking/challenge (${http403})`);
    if (networkErrors > 0) signals.push(`network-level transport errors (${networkErrors})`);
    if (http5xx > 0) signals.push(`HTTP 5xx upstream errors (${http5xx})`);
    if (http404 > 0) signals.push(`HTTP 404 responses (${http404})`);

    const successCount = probeOutcomes.filter(item => item.success).length;
    const totalProbeCalls = probeOutcomes.length;
    const avgDurationMs = totalProbeCalls > 0
        ? Math.round(probeOutcomes.reduce((sum, item) => sum + item.durationMs, 0) / totalProbeCalls)
        : 0;

    console.log('\n📊 Probe summary');
    console.log(`   Total probe calls: ${totalProbeCalls}`);
    console.log(`   Successful calls: ${successCount}`);
    console.log(`   Failed calls: ${totalProbeCalls - successCount}`);
    console.log(`   Avg duration: ${avgDurationMs}ms`);
    console.log(`   Traced PLP calls: ${probeTraces.length}`);
    console.log(`   Status counts: ${JSON.stringify(statusCounts)}`);

    if (signals.length > 0) {
        console.log(`   ⚠️ Signals detected: ${signals.join('; ')}`);
    } else {
        console.log('   ✅ No anti-bot/network instability signals detected in this probe window');
    }

    return {
        signalDetected: signals.length > 0,
        signals,
    };
}

runTests().catch(console.error);
