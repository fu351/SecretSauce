/**
 * Cache Warming Script
 *
 * Pre-populates the ingredient cache with popular ingredients to improve
 * response times and reduce scraping load during peak hours.
 *
 * Usage:
 *   tsx scripts/warm-ingredient-cache.ts [--top N] [--stores store1,store2]
 *
 * Examples:
 *   tsx scripts/warm-ingredient-cache.ts --top 50
 *   tsx scripts/warm-ingredient-cache.ts --top 100 --stores walmart,target
 *   tsx scripts/warm-ingredient-cache.ts --force-refresh
 */

import { createClient } from "@supabase/supabase-js"
import { getOrRefreshIngredientPricesForStores } from "../lib/ingredient-pipeline"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required environment variables:")
  console.error("  NEXT_PUBLIC_SUPABASE_URL")
  console.error("  SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const DEFAULT_STORES = [
  "walmart",
  "target",
  "kroger",
  "meijer",
  "traderjoes",
  "aldi",
  "safeway",
  "wholefoods",
]

interface WarmingOptions {
  topN: number
  stores: string[]
  forceRefresh: boolean
  zipCode?: string
}

/**
 * Get the most popular ingredients based on cache access frequency
 */
async function getPopularIngredients(limit: number): Promise<Array<{ id: string; canonical_name: string; access_count: number }>> {
  console.log(`\n📊 Finding top ${limit} most popular ingredients...`)

  // Query to get ingredients ordered by how often they're in the cache
  const { data, error } = await supabase
    .from("ingredient_cache")
    .select("standardized_ingredient_id")
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("Error fetching ingredient cache:", error)
    return []
  }

  if (!data || data.length === 0) {
    console.log("⚠️  No cached ingredients found. Using default popular ingredients...")
    return getDefaultPopularIngredients(limit)
  }

  // Count frequency of each ingredient
  const frequencyMap = new Map<string, number>()
  for (const item of data) {
    const count = frequencyMap.get(item.standardized_ingredient_id) || 0
    frequencyMap.set(item.standardized_ingredient_id, count + 1)
  }

  // Sort by frequency
  const sortedIds = Array.from(frequencyMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)

  // Fetch ingredient details
  const { data: ingredients, error: ingredientError } = await supabase
    .from("standardized_ingredients")
    .select("id, canonical_name")
    .in("id", sortedIds)

  if (ingredientError) {
    console.error("Error fetching ingredient details:", ingredientError)
    return []
  }

  const results = ingredients?.map(ing => ({
    id: ing.id,
    canonical_name: ing.canonical_name,
    access_count: frequencyMap.get(ing.id) || 0
  })) || []

  console.log(`✅ Found ${results.length} popular ingredients`)
  return results
}

/**
 * Default list of popular ingredients if cache is empty
 */
async function getDefaultPopularIngredients(limit: number): Promise<Array<{ id: string; canonical_name: string; access_count: number }>> {
  const popularNames = [
    "chicken breast",
    "ground beef",
    "eggs",
    "milk",
    "butter",
    "onion",
    "garlic",
    "tomato",
    "potato",
    "rice",
    "pasta",
    "cheese",
    "bread",
    "olive oil",
    "salt",
    "pepper",
    "flour",
    "sugar",
    "chicken thighs",
    "bacon",
    "lettuce",
    "carrot",
    "celery",
    "bell pepper",
    "broccoli",
    "spinach",
    "ground turkey",
    "salmon",
    "shrimp",
    "lemon",
    "lime",
    "cilantro",
    "parsley",
    "basil",
    "oregano",
    "cumin",
    "paprika",
    "soy sauce",
    "honey",
    "yogurt",
    "cream cheese",
    "sour cream",
    "cheddar cheese",
    "mozzarella",
    "parmesan",
    "green beans",
    "corn",
    "black beans",
    "chickpeas",
    "peanut butter",
  ].slice(0, limit)

  // Get or create standardized ingredients
  const results: Array<{ id: string; canonical_name: string; access_count: number }> = []

  for (const name of popularNames) {
    const { data, error } = await supabase
      .from("standardized_ingredients")
      .select("id, canonical_name")
      .eq("canonical_name", name.toLowerCase())
      .maybeSingle()

    if (data) {
      results.push({
        id: data.id,
        canonical_name: data.canonical_name,
        access_count: 0
      })
    } else if (!error) {
      // Create if doesn't exist
      const { data: created, error: createError } = await supabase
        .from("standardized_ingredients")
        .insert({ canonical_name: name.toLowerCase(), category: "grocery" })
        .select("id, canonical_name")
        .single()

      if (created && !createError) {
        results.push({
          id: created.id,
          canonical_name: created.canonical_name,
          access_count: 0
        })
      }
    }
  }

  return results
}

/**
 * Warm the cache for a single ingredient across all stores
 */
async function warmIngredient(
  ingredient: { id: string; canonical_name: string },
  stores: string[],
  options: { forceRefresh: boolean; zipCode?: string }
): Promise<{ success: number; failed: number }> {
  console.log(`  🔄 Warming "${ingredient.canonical_name}"...`)

  try {
    const results = await getOrRefreshIngredientPricesForStores(
      supabase as any,
      ingredient.id,
      stores,
      { zipCode: options.zipCode }
    )

    const success = results.length
    const failed = stores.length - success

    if (success > 0) {
      console.log(`    ✅ Cached ${success}/${stores.length} stores`)
    }
    if (failed > 0) {
      console.log(`    ⚠️  Failed ${failed} stores`)
    }

    return { success, failed }
  } catch (error) {
    console.error(`    ❌ Error warming ingredient:`, error)
    return { success: 0, failed: stores.length }
  }
}

/**
 * Main warming function
 */
async function warmCache(options: WarmingOptions) {
  console.log("\n🔥 Starting Cache Warming Process")
  console.log("=" .repeat(50))
  console.log(`  Top N ingredients: ${options.topN}`)
  console.log(`  Stores: ${options.stores.join(", ")}`)
  console.log(`  Force refresh: ${options.forceRefresh ? "Yes" : "No"}`)
  console.log(`  Zip code: ${options.zipCode || "Default"}`)
  console.log("=" .repeat(50))

  const startTime = Date.now()

  // Get popular ingredients
  const ingredients = await getPopularIngredients(options.topN)

  if (ingredients.length === 0) {
    console.log("\n❌ No ingredients to warm")
    return
  }

  console.log(`\n🎯 Warming cache for ${ingredients.length} ingredients across ${options.stores.length} stores`)
  console.log(`   Total operations: ${ingredients.length * options.stores.length}`)

  let totalSuccess = 0
  let totalFailed = 0

  // Warm cache for each ingredient
  for (let i = 0; i < ingredients.length; i++) {
    const ingredient = ingredients[i]
    console.log(`\n[${i + 1}/${ingredients.length}] ${ingredient.canonical_name}`)

    const result = await warmIngredient(ingredient, options.stores, {
      forceRefresh: options.forceRefresh,
      zipCode: options.zipCode
    })

    totalSuccess += result.success
    totalFailed += result.failed

    // Add small delay to avoid overwhelming scrapers
    if (i < ingredients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log("\n" + "=".repeat(50))
  console.log("✅ Cache Warming Complete!")
  console.log("=".repeat(50))
  console.log(`  Ingredients processed: ${ingredients.length}`)
  console.log(`  Successful cache entries: ${totalSuccess}`)
  console.log(`  Failed cache entries: ${totalFailed}`)
  console.log(`  Success rate: ${((totalSuccess / (totalSuccess + totalFailed)) * 100).toFixed(1)}%`)
  console.log(`  Duration: ${duration}s`)
  console.log("=".repeat(50))
}

/**
 * Parse command line arguments
 */
function parseArgs(): WarmingOptions {
  const args = process.argv.slice(2)

  const options: WarmingOptions = {
    topN: 50,
    stores: DEFAULT_STORES,
    forceRefresh: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--top" && args[i + 1]) {
      options.topN = parseInt(args[i + 1], 10)
      i++
    } else if (arg === "--stores" && args[i + 1]) {
      options.stores = args[i + 1].split(",").map(s => s.trim().toLowerCase())
      i++
    } else if (arg === "--force-refresh") {
      options.forceRefresh = true
    } else if (arg === "--zip" && args[i + 1]) {
      options.zipCode = args[i + 1]
      i++
    } else if (arg === "--help") {
      console.log(`
Cache Warming Script

Usage:
  tsx scripts/warm-ingredient-cache.ts [options]

Options:
  --top N              Number of top ingredients to warm (default: 50)
  --stores store1,...  Comma-separated list of stores (default: all)
  --force-refresh      Force refresh even if cached
  --zip ZIPCODE        Zip code for location-specific pricing
  --help               Show this help message

Examples:
  tsx scripts/warm-ingredient-cache.ts --top 50
  tsx scripts/warm-ingredient-cache.ts --top 100 --stores walmart,target
  tsx scripts/warm-ingredient-cache.ts --force-refresh --zip 47906
      `)
      process.exit(0)
    }
  }

  return options
}

// Run the script
if (require.main === module) {
  const options = parseArgs()

  warmCache(options)
    .then(() => {
      console.log("\n✅ Done!")
      process.exit(0)
    })
    .catch((error) => {
      console.error("\n❌ Fatal error:", error)
      process.exit(1)
    })
}

export { warmCache, getPopularIngredients }
