import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { cacheIngredientPrice } from "@/lib/ingredient-cache"

// List of stores to scrape
const STORES = [
  "Target",
  "Kroger",
  "Meijer",
  "99 Ranch",
  "Walmart",
  "Aldi",
  "Safeway",
  "Trader Joes"
]
const DEFAULT_ZIP_CODE = "94704"

export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron request or authorized call
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    // Allow requests from Vercel Cron with proper secret, or direct calls from same origin
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // If CRON_SECRET is set and this doesn't match, reject unless it's from localhost (for testing)
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    console.log("Starting daily ingredient scraper...")
    const client = createServerClient()

    // Get all standardized ingredients
    const { data: ingredients, error: ingredientsError } = await client
      .from("standardized_ingredients")
      .select("id, canonical_name, category")

    if (ingredientsError || !ingredients) {
      console.error("Error fetching standardized ingredients:", ingredientsError)
      return NextResponse.json(
        { error: "Failed to fetch ingredients", details: ingredientsError },
        { status: 500 }
      )
    }

    console.log(`Found ${ingredients.length} standardized ingredients to scrape`)

    // Scrape each ingredient from each store
    const results = {
      total: ingredients.length,
      stores: STORES.length,
      cached: 0,
      failed: 0,
      errors: [] as string[],
    }

    for (const ingredient of ingredients) {
      try {
        // Scrape from each store
        const storePromises = STORES.map((store) =>
          scrapeAndCacheIngredient(ingredient.id, ingredient.canonical_name, store)
            .then(() => {
              results.cached++
            })
            .catch((error) => {
              results.failed++
              const errorMsg = `Failed to scrape ${ingredient.canonical_name} from ${store}: ${error.message}`
              console.error(errorMsg)
              results.errors.push(errorMsg)
            })
        )

        await Promise.allSettled(storePromises)
      } catch (error) {
        console.error(`Error processing ingredient ${ingredient.canonical_name}:`, error)
        results.failed++
      }
    }

    console.log("Daily scraper completed", results)
    return NextResponse.json({
      success: true,
      message: "Daily scraper completed",
      results,
    })
  } catch (error) {
    console.error("Error in daily scraper:", error)
    return NextResponse.json(
      {
        error: "Failed to run daily scraper",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * Scrape a single ingredient from a specific store and cache the result
 */
async function scrapeAndCacheIngredient(ingredientId: string, ingredientName: string, store: string) {
  try {
    const scrapers = require("@/lib/scrapers")
    const { simplifyIngredientTokens } = require("@/lib/ingredient-cache")

    // Try scraping with canonical name first
    let scrapedItems: any[] = []

    switch (store) {
      case "Target":
        scrapedItems = (await scrapers.getTargetProducts(ingredientName, null, DEFAULT_ZIP_CODE)) || []
        break
      case "Kroger":
        scrapedItems = (await scrapers.Krogers(DEFAULT_ZIP_CODE, ingredientName)) || []
        break
      case "Meijer":
        scrapedItems = (await scrapers.Meijers(DEFAULT_ZIP_CODE, ingredientName)) || []
        break
      case "99 Ranch":
        scrapedItems = (await scrapers.search99Ranch(ingredientName, DEFAULT_ZIP_CODE)) || []
        break
      case "Walmart":
        scrapedItems = (await scrapers.searchWalmartAPI(ingredientName, DEFAULT_ZIP_CODE)) || []
        break
      case "Aldi":
        scrapedItems = (await scrapers.searchAldi(ingredientName, DEFAULT_ZIP_CODE)) || []
        break
      case "Safeway":
        scrapedItems = (await scrapers.searchSafeway(ingredientName, DEFAULT_ZIP_CODE)) || []
        break
      case "Trader Joes":
        scrapedItems = (await scrapers.searchTraderJoes(ingredientName, DEFAULT_ZIP_CODE)) || []
        break
      default:
        throw new Error(`Unknown store: ${store}`)
    }

    // Fallback: If no results, try with simplified name (removes stop words)
    if ((!scrapedItems || scrapedItems.length === 0) && ingredientName.includes(" ")) {
      const simplifiedName = simplifyIngredientTokens(ingredientName)
      if (simplifiedName && simplifiedName !== ingredientName) {
        console.log(`[${store}] No results for "${ingredientName}", trying simplified: "${simplifiedName}"`)

        switch (store) {
          case "Target":
            scrapedItems = (await scrapers.getTargetProducts(simplifiedName, null, DEFAULT_ZIP_CODE)) || []
            break
          case "Kroger":
            scrapedItems = (await scrapers.Krogers(DEFAULT_ZIP_CODE, simplifiedName)) || []
            break
          case "Meijer":
            scrapedItems = (await scrapers.Meijers(DEFAULT_ZIP_CODE, simplifiedName)) || []
            break
          case "99 Ranch":
            scrapedItems = (await scrapers.search99Ranch(simplifiedName, DEFAULT_ZIP_CODE)) || []
            break
          case "Walmart":
            scrapedItems = (await scrapers.searchWalmartAPI(simplifiedName, DEFAULT_ZIP_CODE)) || []
            break
          case "Aldi":
            scrapedItems = (await scrapers.searchAldi(simplifiedName, DEFAULT_ZIP_CODE)) || []
            break
          case "Safeway":
            scrapedItems = (await scrapers.searchSafeway(simplifiedName, DEFAULT_ZIP_CODE)) || []
            break
          case "Trader Joes":
            scrapedItems = (await scrapers.searchTraderJoes(simplifiedName, DEFAULT_ZIP_CODE)) || []
            break
        }
      }
    }

    // If we got results, cache the cheapest one from this store
    if (scrapedItems && scrapedItems.length > 0) {
      // Find the cheapest item
      const cheapest = scrapedItems.reduce((prev, current) => {
        const prevPrice = Number(prev.price) || 0
        const currentPrice = Number(current.price) || 0
        return currentPrice < prevPrice ? current : prev
      })

      // Extract unit and quantity from the scraper response
      const unit = cheapest.unit || "item"
      const quantity = cheapest.quantity || 1
      const unitPrice = cheapest.pricePerUnit ? parseFloat(cheapest.pricePerUnit) : null

      // Cache the cheapest item for this ingredient from this store
      const success = await cacheIngredientPrice(
        ingredientId,
        store,
        cheapest.title || cheapest.name || ingredientName,
        Number(cheapest.price) || 0,
        quantity,
        unit,
        unitPrice,
        cheapest.image_url,
        cheapest.product_url || null,
        cheapest.id || null
      )

      if (!success) {
        throw new Error(`Failed to cache ingredient for ${store}`)
      }

      console.log(`Cached ${ingredientName} from ${store}: $${cheapest.price}`)
    } else {
      console.warn(`No results found for ${ingredientName} from ${store}`)
    }
  } catch (error) {
    console.error(`Error scraping ${ingredientName} from ${store}:`, error)
    throw error
  }
}

/**
 * POST endpoint to trigger the scraper manually
 * Useful for testing or manual runs
 */
export async function POST(request: NextRequest) {
  // Verify authentication
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  // Call GET handler
  return GET(request)
}
