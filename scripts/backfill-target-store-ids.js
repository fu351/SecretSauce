#!/usr/bin/env node

/**
 * Target Store ID Backfill Tool
 *
 * Backfills missing or invalid Target store IDs in the grocery_stores table
 * by querying Target's getNearestStore API for each ZIP code.
 *
 * Usage:
 *   node scripts/backfill-target-store-ids.js [--dry-run] [--limit N] [--zip ZIPCODE]
 *
 * Examples:
 *   node scripts/backfill-target-store-ids.js --dry-run        # Preview changes
 *   node scripts/backfill-target-store-ids.js --limit 10       # Backfill first 10 stores
 *   node scripts/backfill-target-store-ids.js --zip 94015      # Backfill specific ZIP
 *   node scripts/backfill-target-store-ids.js                  # Backfill all missing IDs
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// We need to access the internal getNearestStore function from target.js
// Since it's not exported, we'll temporarily export it or create our own version
const targetModule = require('../lib/scrapers/target.js')

// Helper function to get nearest store (mirrors target.js logic)
async function getNearestStoreForZip(zipCode) {
  const axios = require('axios')

  const baseUrl = 'https://redsky.target.com/redsky_aggregations/v1/web/nearby_stores_v1'
  const params = {
    key: '9f36aeafbe60771e321a7cc95a78140772ab3e96',
    latitude: 0,
    longitude: 0,
    place: zipCode,
    within: 20,
    limit: 1,
    unit: 'mile'
  }

  try {
    const response = await axios.get(baseUrl, {
      params,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000,
      validateStatus: (status) => status < 600
    })

    if (response.status !== 200) {
      console.error(`    Target API returned status ${response.status} for ZIP ${zipCode}`)
      return null
    }

    const stores = response.data?.data?.nearby_stores?.stores || []
    if (stores.length === 0) {
      return null
    }

    const nearestStore = stores[0]
    return {
      target_store_id: nearestStore.store_id ? String(nearestStore.store_id) : null,
      name: nearestStore.location_name || 'Unknown Target',
      fullAddress: `${nearestStore.mailing_address?.address_line1 || ''}, ${nearestStore.mailing_address?.city || ''}, ${nearestStore.mailing_address?.region || ''} ${nearestStore.mailing_address?.postal_code || ''}`.trim(),
      city: nearestStore.mailing_address?.city || null,
      state: nearestStore.mailing_address?.region || null,
      distance: nearestStore.distance || null
    }
  } catch (error) {
    console.error(`    Error calling Target API for ZIP ${zipCode}:`, error.message)
    return null
  }
}

async function backfillStoreIds(options = {}) {
  const {
    dryRun = false,
    limit = null,
    zipCode = null
  } = options

  console.log('\n🔧 Backfilling Target Store IDs...')
  console.log(`   Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE (will update database)'}`)
  console.log('')

  // Fetch Target stores that need backfilling (missing target_store_id)
  let query = supabase
    .from('grocery_stores')
    .select('id, zip_code, metadata, address, name, city, state')
    .eq('store_enum', 'target')
    .eq('is_active', true)
    .not('zip_code', 'is', null)

  if (zipCode) {
    query = query.eq('zip_code', zipCode)
  }

  if (limit) {
    query = query.limit(limit)
  }

  const { data: stores, error } = await query

  if (error) {
    console.error('❌ Error fetching stores:', error.message)
    throw error
  }

  if (!stores || stores.length === 0) {
    console.log('✅ No stores found that need backfilling')
    return { total: 0, updated: 0, skipped: 0, failed: 0 }
  }

  // Filter to only stores missing target_store_id
  const storesToBackfill = stores.filter(store => !store.metadata?.target_store_id)

  if (storesToBackfill.length === 0) {
    console.log('✅ All stores already have target_store_id')
    return { total: stores.length, updated: 0, skipped: stores.length, failed: 0 }
  }

  console.log(`Found ${storesToBackfill.length} stores missing target_store_id\n`)

  const results = {
    total: storesToBackfill.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    updates: []
  }

  for (const store of storesToBackfill) {
    const displayName = `${store.name || 'Target'} (${store.city || 'unknown city'}, ${store.state || '??'})`

    console.log(`📍 Processing ZIP ${store.zip_code}: ${displayName}`)

    try {
      const apiStore = await getNearestStoreForZip(store.zip_code)

      if (!apiStore || !apiStore.target_store_id) {
        results.failed++
        console.log(`   ❌ No Target store found via API\n`)
        continue
      }

      const newMetadata = {
        ...(store.metadata || {}),
        target_store_id: apiStore.target_store_id,
        target_store_name: apiStore.name,
        target_store_address: apiStore.fullAddress,
        backfilled_at: new Date().toISOString(),
        backfill_source: 'getNearestStore_api'
      }

      if (dryRun) {
        console.log(`   [DRY RUN] Would set target_store_id: ${apiStore.target_store_id}`)
        console.log(`   [DRY RUN] Store name: ${apiStore.name}`)
        console.log(`   [DRY RUN] Address: ${apiStore.fullAddress}\n`)
        results.updated++
        results.updates.push({
          zip: store.zip_code,
          dbId: store.id,
          storeId: apiStore.target_store_id,
          storeName: apiStore.name
        })
      } else {
        const { error: updateError } = await supabase
          .from('grocery_stores')
          .update({ metadata: newMetadata })
          .eq('id', store.id)

        if (updateError) {
          console.log(`   ❌ Database update failed: ${updateError.message}\n`)
          results.failed++
        } else {
          console.log(`   ✅ Updated with target_store_id: ${apiStore.target_store_id}`)
          console.log(`      Store: ${apiStore.name}`)
          console.log(`      Address: ${apiStore.fullAddress}\n`)
          results.updated++
          results.updates.push({
            zip: store.zip_code,
            dbId: store.id,
            storeId: apiStore.target_store_id,
            storeName: apiStore.name
          })
        }
      }

      // Rate limit: 1 request per second
      await new Promise(resolve => setTimeout(resolve, 1000))

    } catch (err) {
      results.failed++
      console.log(`   ❌ Error: ${err.message}\n`)
    }
  }

  // Print summary
  console.log('\n📊 BACKFILL SUMMARY:')
  console.log('='.repeat(70))
  console.log(`  Total Stores: ${results.total}`)
  console.log(`  ✅ Updated: ${results.updated}`)
  console.log(`  ⏭️  Skipped: ${results.skipped}`)
  console.log(`  ❌ Failed: ${results.failed}`)
  console.log('='.repeat(70))

  if (results.updates.length > 0) {
    console.log('\n📝 Updated Stores:')
    results.updates.forEach(u => {
      console.log(`  • ZIP ${u.zip}: ${u.storeId} (${u.storeName})`)
    })
  }

  if (dryRun && results.updated > 0) {
    console.log('\n💡 To apply these changes, run without --dry-run flag\n')
  }

  return results
}

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limit = args.includes('--limit') ?
  parseInt(args[args.indexOf('--limit') + 1]) : null
const zipCode = args.includes('--zip') ?
  args[args.indexOf('--zip') + 1] : null

// Main execution
backfillStoreIds({ dryRun, limit, zipCode })
  .then(() => {
    console.log('✅ Backfill complete\n')
    process.exit(0)
  })
  .catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
  })
