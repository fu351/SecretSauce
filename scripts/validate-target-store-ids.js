#!/usr/bin/env node

/**
 * Target Store ID Validation Tool
 *
 * Validates that Target store IDs in the grocery_stores database are valid
 * by calling Target's getNearestStore API for each ZIP code and comparing results.
 *
 * This helps identify:
 * - Stores with missing store IDs in metadata
 * - Stores with outdated/incorrect store IDs
 * - ZIPs where the nearest Target store has changed
 *
 * Usage:
 *   node scripts/validate-target-store-ids.js [--limit N] [--zip ZIPCODE]
 *
 * Examples:
 *   node scripts/validate-target-store-ids.js              # Validate all Target stores
 *   node scripts/validate-target-store-ids.js --limit 20   # Validate first 20 stores
 *   node scripts/validate-target-store-ids.js --zip 94704  # Validate specific ZIP
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

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Import Target scraper to use getNearestStore
const scrapers = require('../lib/scrapers')

async function validateStoreIds(options = {}) {
  const { limit = null, zipCode = null } = options

  console.log('\n🔍 Validating Target Store IDs...\n')

  // Fetch Target stores from database
  let query = supabase
    .from('grocery_stores')
    .select('id, zip_code, metadata, address, name')
    .eq('store_enum', 'target')
    .eq('is_active', true)

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
    console.log('⚠️  No Target stores found matching criteria')
    return { valid: 0, invalid: 0, missing: 0, mismatches: [] }
  }

  console.log(`Found ${stores.length} Target stores to validate\n`)

  const results = {
    valid: 0,
    invalid: 0,
    missing: 0,
    mismatches: []
  }

  for (const store of stores) {
    const dbStoreId = store.metadata?.target_store_id

    if (!dbStoreId) {
      results.missing++
      console.log(`⚠️  ${store.zip_code} (${store.name || 'unnamed'}): NO STORE ID IN METADATA`)
      results.mismatches.push({
        dbRecordId: store.id,
        zipCode: store.zip_code,
        issue: 'missing_store_id',
        storeName: store.name
      })
      continue
    }

    try {
      // Call Target's API to get the nearest store for this ZIP
      const apiStore = await scrapers.getNearestStore(store.zip_code)

      if (!apiStore || !apiStore.target_store_id) {
        results.invalid++
        console.log(`❌ ${store.zip_code} (DB: ${dbStoreId}): API returned NO STORE`)
        results.mismatches.push({
          dbStoreId,
          zipCode: store.zip_code,
          dbRecordId: store.id,
          issue: 'no_api_store',
          storeName: store.name
        })
      } else if (apiStore.target_store_id !== dbStoreId) {
        results.invalid++
        console.log(`❌ ${store.zip_code}: MISMATCH - DB has ${dbStoreId}, API says ${apiStore.target_store_id}`)
        console.log(`   DB store: ${store.name || 'unnamed'}`)
        console.log(`   API store: ${apiStore.name || 'unnamed'}`)
        results.mismatches.push({
          dbStoreId,
          apiStoreId: apiStore.target_store_id,
          zipCode: store.zip_code,
          dbRecordId: store.id,
          issue: 'id_mismatch',
          dbStoreName: store.name,
          apiStoreName: apiStore.name
        })
      } else {
        results.valid++
        console.log(`✅ ${store.zip_code}: ${dbStoreId} valid (${store.name || 'unnamed'})`)
      }

      // Rate limit to avoid hammering Target API (1 request per second)
      await new Promise(resolve => setTimeout(resolve, 1000))

    } catch (err) {
      console.log(`⚠️  ${store.zip_code} (DB: ${dbStoreId}): API ERROR - ${err.message}`)
      // Don't count API errors as invalid - could be temporary
    }
  }

  // Print summary
  console.log('\n📊 VALIDATION SUMMARY:')
  console.log('='.repeat(60))
  console.log(`  Total Stores: ${results.valid + results.invalid + results.missing}`)
  console.log(`  ✅ Valid: ${results.valid}`)
  console.log(`  ❌ Invalid: ${results.invalid}`)
  console.log(`  ⚠️  Missing Store ID: ${results.missing}`)
  console.log('='.repeat(60))

  // Print recommended fixes
  if (results.mismatches.length > 0) {
    console.log('\n🔧 ISSUES FOUND:\n')

    const missingIds = results.mismatches.filter(m => m.issue === 'missing_store_id')
    const noApiStore = results.mismatches.filter(m => m.issue === 'no_api_store')
    const idMismatches = results.mismatches.filter(m => m.issue === 'id_mismatch')

    if (missingIds.length > 0) {
      console.log(`Missing Store IDs (${missingIds.length}):`)
      missingIds.forEach(m => {
        console.log(`  - ZIP ${m.zipCode}: ${m.storeName || 'unnamed'} (DB ID: ${m.dbRecordId})`)
      })
      console.log('')
    }

    if (noApiStore.length > 0) {
      console.log(`No API Store Found (${noApiStore.length}):`)
      console.log('  These ZIPs may not have a nearby Target store anymore.')
      noApiStore.forEach(m => {
        console.log(`  - ZIP ${m.zipCode}: DB has ${m.dbStoreId}`)
      })
      console.log('')
    }

    if (idMismatches.length > 0) {
      console.log(`Store ID Mismatches (${idMismatches.length}):`)
      console.log('  Database has different store ID than Target API reports for that ZIP.\n')
      idMismatches.forEach(m => {
        console.log(`  - ZIP ${m.zipCode}:`)
        console.log(`    DB: ${m.dbStoreId} (${m.dbStoreName || 'unnamed'})`)
        console.log(`    API: ${m.apiStoreId} (${m.apiStoreName || 'unnamed'})`)
      })
      console.log('')
    }

    console.log('💡 Next Steps:')
    console.log('  1. Run scripts/backfill-target-store-ids.js to fix store IDs (when implemented)')
    console.log('  2. Or manually update with SQL (see plan document for examples)')
    console.log('  3. Consider marking stores with no_api_store as inactive\n')
  } else {
    console.log('\n✅ All stores validated successfully!\n')
  }

  return results
}

// Parse command line arguments
const args = process.argv.slice(2)
const limit = args.includes('--limit') ?
  parseInt(args[args.indexOf('--limit') + 1]) : null
const zipCode = args.includes('--zip') ?
  args[args.indexOf('--zip') + 1] : null

// Main execution
validateStoreIds({ limit, zipCode })
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
  })
