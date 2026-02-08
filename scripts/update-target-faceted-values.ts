#!/usr/bin/env ts-node
/**
 * Script to update Target store faceted values in the database
 *
 * The faceted value is Target's internal filter parameter used for "in store" filtering.
 * You can find it by:
 * 1. Go to target.com and search for any product
 * 2. Click "Pick it up" or filter by store
 * 3. Look at the URL for the facetedValue parameter (e.g., facetedValue=5zkty)
 *
 * Usage:
 *   npx ts-node scripts/update-target-faceted-values.ts
 */

import { groceryStoresDB } from "../lib/database/grocery-stores-db"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../lib/database/supabase"

// Store ID to faceted value mapping
// TODO: Add your Target store faceted values here
const TARGET_FACETED_VALUES: Record<string, string> = {
  // Example: "3202": "5zkty",  // Berkeley Central Target
  // Add more stores as you discover their faceted values
}

async function updateTargetFacetedValues() {
  console.log("🎯 Updating Target store faceted values...")

  // Get all Target stores from database
  const targetStores = await groceryStoresDB.findByStoreEnum("target")

  if (targetStores.length === 0) {
    console.log("❌ No Target stores found in database")
    return
  }

  console.log(`📊 Found ${targetStores.length} Target stores`)

  let updatedCount = 0
  let skippedCount = 0

  for (const store of targetStores) {
    // Extract Target store ID from name or metadata
    const storeId = extractTargetStoreId(store)

    if (!storeId) {
      console.log(`⚠️  Could not extract store ID for: ${store.name}`)
      skippedCount++
      continue
    }

    const facetedValue = TARGET_FACETED_VALUES[storeId]

    if (!facetedValue) {
      console.log(`⏭️  No faceted value defined for store ${storeId} (${store.name})`)
      skippedCount++
      continue
    }

    // Update store with faceted value
    const updated = await groceryStoresDB.updateStore(store.id, {
      metadata: {
        ...((store as any).metadata || {}),
        targetStoreId: storeId,
        facetedValue: facetedValue,
      },
    })

    if (updated) {
      console.log(`✅ Updated store ${storeId} (${store.name}) with facetedValue: ${facetedValue}`)
      updatedCount++
    } else {
      console.log(`❌ Failed to update store ${storeId}`)
    }
  }

  console.log("\n📈 Summary:")
  console.log(`  ✅ Updated: ${updatedCount} stores`)
  console.log(`  ⏭️  Skipped: ${skippedCount} stores`)
  console.log(`  📊 Total: ${targetStores.length} stores`)

  if (skippedCount > 0) {
    console.log("\n💡 To add missing faceted values:")
    console.log("   1. Visit target.com and search for a product")
    console.log("   2. Click 'Pick it up' and select a store")
    console.log("   3. Look for 'facetedValue' in the URL")
    console.log("   4. Add it to TARGET_FACETED_VALUES in this script")
  }
}

/**
 * Extract Target store ID from store data
 * The store ID might be in the name, metadata, or address
 */
function extractTargetStoreId(store: any): string | null {
  // Try metadata first
  if (store.metadata?.targetStoreId) {
    return store.metadata.targetStoreId
  }

  // Try parsing from name (e.g., "Target #3202" or "Berkeley Central Target")
  const nameMatch = store.name.match(/#?(\d{4})/)
  if (nameMatch) {
    return nameMatch[1]
  }

  // Try getting from address or other fields
  // You may need to customize this based on your data structure
  return null
}

/**
 * Helper function to discover faceted values for a store
 * This would need to scrape Target's website or use their API
 */
async function discoverFacetedValue(storeId: string): Promise<string | null> {
  // TODO: Implement discovery logic
  // This could involve:
  // 1. Making a request to Target's store locator API
  // 2. Scraping the Target website
  // 3. Extracting the facetedValue from search results
  console.log(`🔍 Discovering faceted value for store ${storeId}...`)
  return null
}

// Run the script
if (require.main === module) {
  updateTargetFacetedValues()
    .then(() => {
      console.log("\n✅ Done!")
      process.exit(0)
    })
    .catch((error) => {
      console.error("\n❌ Error:", error)
      process.exit(1)
    })
}

export { updateTargetFacetedValues, extractTargetStoreId }