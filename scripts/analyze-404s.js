#!/usr/bin/env node

/**
 * 404 Analysis Dashboard
 *
 * Analyzes Target API 404 errors from the target_404_log table to identify patterns.
 * Helps diagnose root causes by showing which stores, ingredients, and ZIPs have the most 404s.
 *
 * Usage:
 *   node scripts/analyze-404s.js [time-window]
 *
 * Examples:
 *   node scripts/analyze-404s.js           # Last 7 days (default)
 *   node scripts/analyze-404s.js "1 day"   # Last 24 hours
 *   node scripts/analyze-404s.js "30 days" # Last month
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function analyze404s(since = '7 days') {
  console.log(`\n📊 Analyzing Target 404s from last ${since}...\n`)

  // Total count
  const { count: total, error: countError } = await supabase
    .from('target_404_log')
    .select('*', { count: 'exact', head: true })
    .gte('scraped_at', `now() - interval '${since}'`)

  if (countError) {
    console.error('❌ Error fetching count:', countError.message)
    throw countError
  }

  console.log(`Total 404s: ${total}\n`)

  if (total === 0) {
    console.log('✅ No 404 errors found in the specified time window.')
    return
  }

  // By store ID and ZIP
  const { data: byStore, error: storeError } = await supabase
    .from('target_404_log')
    .select('target_store_id, zip_code')
    .gte('scraped_at', `now() - interval '${since}'`)

  if (storeError) {
    console.error('❌ Error fetching store data:', storeError.message)
  } else if (byStore) {
    const storeCounts = byStore.reduce((acc, r) => {
      const key = `${r.target_store_id || 'NULL'} (${r.zip_code})`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    console.log('Top 404 Target Store IDs:')
    Object.entries(storeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([k, c]) => console.log(`  ${k}: ${c}`))
    console.log('')
  }

  // By ingredient
  const { data: byIng, error: ingError } = await supabase
    .from('target_404_log')
    .select('ingredient_name')
    .gte('scraped_at', `now() - interval '${since}'`)

  if (ingError) {
    console.error('❌ Error fetching ingredient data:', ingError.message)
  } else if (byIng) {
    const ingCounts = byIng.reduce((acc, r) => {
      acc[r.ingredient_name] = (acc[r.ingredient_name] || 0) + 1
      return acc
    }, {})

    console.log('Top 404 Ingredients:')
    Object.entries(ingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([k, c]) => console.log(`  ${k}: ${c}`))
    console.log('')
  }

  // By ZIP code
  const { data: byZip, error: zipError } = await supabase
    .from('target_404_log')
    .select('zip_code')
    .gte('scraped_at', `now() - interval '${since}'`)

  if (zipError) {
    console.error('❌ Error fetching ZIP data:', zipError.message)
  } else if (byZip) {
    const zipCounts = byZip.reduce((acc, r) => {
      acc[r.zip_code] = (acc[r.zip_code] || 0) + 1
      return acc
    }, {})

    console.log('Top 404 ZIP Codes:')
    Object.entries(zipCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([k, c]) => console.log(`  ${k}: ${c}`))
    console.log('')
  }

  // By store ID source
  const { data: bySource, error: sourceError } = await supabase
    .from('target_404_log')
    .select('store_id_source')
    .gte('scraped_at', `now() - interval '${since}'`)

  if (sourceError) {
    console.error('❌ Error fetching source data:', sourceError.message)
  } else if (bySource) {
    const sourceCounts = bySource.reduce((acc, r) => {
      const src = r.store_id_source || 'unknown'
      acc[src] = (acc[src] || 0) + 1
      return acc
    }, {})

    console.log('404s by Store ID Source:')
    Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([src, c]) => {
        const pct = ((c / total) * 100).toFixed(1)
        console.log(`  ${src}: ${c} (${pct}%)`)
      })
    console.log('')
  }

  // Summary insights
  console.log('💡 Insights:')

  if (bySource) {
    const sourceCounts = bySource.reduce((acc, r) => {
      const src = r.store_id_source || 'unknown'
      acc[src] = (acc[src] || 0) + 1
      return acc
    }, {})

    const dbMetadataCount = sourceCounts.db_metadata || 0
    const getNearestCount = sourceCounts.getNearestStore || 0

    if (dbMetadataCount > getNearestCount * 2) {
      console.log('  • Most 404s come from db_metadata store IDs - consider validating store IDs in grocery_stores table')
    } else if (getNearestCount > dbMetadataCount * 2) {
      console.log('  • Most 404s come from getNearestStore API calls - some ZIPs may not have nearby Target stores')
    }
  }

  if (byIng) {
    const ingCounts = Object.values(byIng.reduce((acc, r) => {
      acc[r.ingredient_name] = (acc[r.ingredient_name] || 0) + 1
      return acc
    }, {}))

    const maxIngredient404s = Math.max(...ingCounts)
    if (maxIngredient404s > total * 0.1) {
      console.log('  • Some ingredients account for >10% of 404s - consider creating ingredient aliases or excluding them')
    }
  }

  console.log('')
}

// Main execution
const since = process.argv[2] || '7 days'

analyze404s(since)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
  })
