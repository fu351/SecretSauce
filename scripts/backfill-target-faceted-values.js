#!/usr/bin/env node

/**
 * Automated script to discover and backfill Target store faceted values
 *
 * Target uses faceted values as internal identifiers for store locations.
 * This script discovers them by making requests to Target's website.
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Rate limiting to avoid being blocked
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds between requests
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Discover faceted value for a Target store by making a search request
 * and extracting the faceted value from the response
 */
async function discoverFacetedValue(storeId, zipCode) {
    try {
        console.log(`  🔍 Discovering faceted value for store ${storeId}...`);

        // Method 1: Try to get faceted value from store locator API
        const storeUrl = `https://api.target.com/stores/v3/target_stores?nearby=${zipCode}&limit=50&within=50&unit=miles`;

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
        };

        const response = await axios.get(storeUrl, {
            headers,
            timeout: 10000
        });

        if (response.data?.locations) {
            // Find the specific store in the response
            const store = response.data.locations.find(loc =>
                loc.location_id === storeId ||
                loc.store_id === storeId
            );

            if (store) {
                // Check if faceted value is in the store data
                // Target might include it as 'facet_id', 'location_facet', etc.
                const facetedValue =
                    store.facet_id ||
                    store.faceted_value ||
                    store.location_facet ||
                    store.midas_store_id;

                if (facetedValue) {
                    console.log(`  ✅ Found faceted value: ${facetedValue}`);
                    return facetedValue;
                }
            }
        }

        // Method 2: Try making a search request and extract from HTML/response
        const searchUrl = `https://www.target.com/s?searchTerm=milk&storeId=${storeId}`;

        const searchResponse = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml',
            },
            maxRedirects: 0,
            validateStatus: (status) => status < 400,
            timeout: 10000
        });

        // Check if the response URL contains a faceted value
        const html = searchResponse.data;

        // Look for faceted value in HTML content
        const facetMatch = html.match(/facetedValue[=:][\s"']*([a-zA-Z0-9]+)/);
        if (facetMatch && facetMatch[1]) {
            console.log(`  ✅ Found faceted value from HTML: ${facetMatch[1]}`);
            return facetMatch[1];
        }

        // Look for midas store ID (another potential identifier)
        const midasMatch = html.match(/midasStoreId[=:][\s"']*([a-zA-Z0-9]+)/i);
        if (midasMatch && midasMatch[1]) {
            console.log(`  ✅ Found midas store ID: ${midasMatch[1]}`);
            return midasMatch[1];
        }

        console.log(`  ⚠️  Could not find faceted value for store ${storeId}`);
        return null;

    } catch (error) {
        console.error(`  ❌ Error discovering faceted value: ${error.message}`);
        return null;
    }
}

/**
 * Extract Target store ID from database store record
 */
function extractStoreId(store) {
    // Try metadata first
    if (store.metadata?.targetStoreId) {
        return store.metadata.targetStoreId;
    }

    // Try parsing from name (e.g., "Target #3202" or "Berkeley Central Target")
    const nameMatch = store.name.match(/#?(\d{4})/);
    if (nameMatch) {
        return nameMatch[1];
    }

    // Try parsing from address
    // Some stores might have the ID in the address
    if (store.address) {
        const addrMatch = store.address.match(/#?(\d{4})/);
        if (addrMatch) {
            return addrMatch[1];
        }
    }

    return null;
}

/**
 * Main backfill function
 */
async function backfillFacetedValues() {
    console.log('🎯 Target Faceted Value Backfill Script');
    console.log('=' .repeat(70));

    // Get all Target stores from database
    const { data: stores, error } = await supabase
        .from('grocery_stores')
        .select('*')
        .eq('store_enum', 'target')
        .eq('is_active', true);

    if (error) {
        console.error('❌ Error fetching stores:', error);
        process.exit(1);
    }

    if (!stores || stores.length === 0) {
        console.log('❌ No Target stores found in database');
        return;
    }

    console.log(`📊 Found ${stores.length} Target stores\n`);

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < stores.length; i++) {
        const store = stores[i];
        const storeId = extractStoreId(store);

        console.log(`\n[${i + 1}/${stores.length}] Processing: ${store.name}`);

        if (!storeId) {
            console.log(`  ⏭️  Could not extract store ID, skipping`);
            skippedCount++;
            continue;
        }

        console.log(`  Store ID: ${storeId}`);

        // Check if faceted value already exists
        if (store.metadata?.facetedValue) {
            console.log(`  ✅ Already has faceted value: ${store.metadata.facetedValue}`);
            skippedCount++;
            continue;
        }

        // Discover faceted value
        const facetedValue = await discoverFacetedValue(storeId, store.zip_code);

        if (facetedValue) {
            // Update database
            const { error: updateError } = await supabase
                .from('grocery_stores')
                .update({
                    metadata: {
                        ...(store.metadata || {}),
                        targetStoreId: storeId,
                        facetedValue: facetedValue,
                        lastUpdated: new Date().toISOString(),
                    }
                })
                .eq('id', store.id);

            if (updateError) {
                console.error(`  ❌ Failed to update database: ${updateError.message}`);
                failedCount++;
            } else {
                console.log(`  ✅ Updated database with faceted value: ${facetedValue}`);
                successCount++;
            }
        } else {
            failedCount++;
        }

        // Rate limiting delay
        if (i < stores.length - 1) {
            await sleep(DELAY_BETWEEN_REQUESTS);
        }
    }

    console.log('\n' + '=' .repeat(70));
    console.log('📈 Backfill Summary:');
    console.log(`  ✅ Successfully updated: ${successCount} stores`);
    console.log(`  ⏭️  Skipped (already had value): ${skippedCount} stores`);
    console.log(`  ❌ Failed: ${failedCount} stores`);
    console.log(`  📊 Total processed: ${stores.length} stores`);
    console.log('=' .repeat(70));

    if (failedCount > 0) {
        console.log('\n💡 For stores that failed, you may need to:');
        console.log('   1. Manually visit target.com and find their faceted values');
        console.log('   2. Update the discovery logic in this script');
        console.log('   3. Check if Target has changed their API/HTML structure');
    }
}

// Run the script
if (require.main === module) {
    backfillFacetedValues()
        .then(() => {
            console.log('\n✅ Done!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { backfillFacetedValues, discoverFacetedValue };
