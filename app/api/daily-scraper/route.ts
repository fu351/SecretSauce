import { type NextRequest, NextResponse } from "next/server"
import { standardizedIngredientsDB } from "@/lib/database/standardized-ingredients-db"
import { ingredientsHistoryDB } from "@/lib/database/ingredients-db"
import { normalizeZipCode } from "@/lib/utils/zip"

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
const FALLBACK_DAILY_ZIP = normalizeZipCode(process.env.ZIP_CODE ?? process.env.DEFAULT_ZIP_CODE)

const INGREDIENT_STOP_WORDS = new Set([
  "fresh",
  "large",
  "small",
  "boneless",
  "skinless",
  "ripe",
  "optional",
  "chopped",
  "sliced",
  "diced",
  "minced",
  "ground",
  "crushed",
  "grated",
  "shredded",
  "cooked",
  "uncooked",
  "raw",
  "whole",
  "dried",
  "toasted",
  "packed",
  "divided",
])

function simplifyIngredientTokens(value: string): string {
  return value
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((token) => token && !INGREDIENT_STOP_WORDS.has(token.toLowerCase()))
    .join(" ")
    .trim()
}

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

    const url = new URL(request.url)
    const zipParam = url.searchParams.get("zipCode") || ""
    const normalizedZipParam = normalizeZipCode(zipParam)
    const zipToUse = normalizedZipParam ?? FALLBACK_DAILY_ZIP

    if (!zipToUse) {
      return NextResponse.json(
        { error: "zipCode is required" },
        { status: 400 }
      )
    }

    console.log("Starting daily ingredient scraper...", { zipCode: zipToUse })

    // Get all standardized ingredients
    const ingredients = await standardizedIngredientsDB.findAll()

    if (!ingredients || ingredients.length === 0) {
      console.error("Error fetching standardized ingredients: empty result")
      return NextResponse.json(
        { error: "Failed to fetch ingredients" },
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
          scrapeAndCacheIngredient(ingredient.id, ingredient.canonical_name, store, zipToUse)
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
async function scrapeAndCacheIngredient(ingredientId: string, ingredientName: string, store: string, zipCode: string) {
  try {
    const scrapers = require("@/lib/scrapers")

    // Try scraping with canonical name first
    let scrapedItems: any[] = []

    switch (store) {
        case "Target":
          scrapedItems = (await scrapers.getTargetProducts(ingredientName, null, zipCode)) || []
          break
        case "Kroger":
          scrapedItems = (await scrapers.Krogers(zipCode, ingredientName)) || []
          break
        case "Meijer":
          scrapedItems = (await scrapers.Meijers(zipCode, ingredientName)) || []
          break
        case "99 Ranch":
          scrapedItems = (await scrapers.search99Ranch(ingredientName, zipCode)) || []
          break
        case "Walmart":
          scrapedItems = (await scrapers.searchWalmartAPI(ingredientName, zipCode)) || []
          break
        case "Aldi":
          scrapedItems = (await scrapers.searchAldi(ingredientName, zipCode)) || []
          break
        case "Safeway":
          scrapedItems = (await scrapers.searchSafeway(ingredientName, zipCode)) || []
          break
        case "Trader Joes":
          scrapedItems = (await scrapers.searchTraderJoes(ingredientName, zipCode)) || []
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
            scrapedItems = (await scrapers.getTargetProducts(simplifiedName, null, zipCode)) || []
            break
          case "Kroger":
            scrapedItems = (await scrapers.Krogers(zipCode, simplifiedName)) || []
            break
          case "Meijer":
            scrapedItems = (await scrapers.Meijers(zipCode, simplifiedName)) || []
            break
          case "99 Ranch":
            scrapedItems = (await scrapers.search99Ranch(simplifiedName, zipCode)) || []
            break
          case "Walmart":
            scrapedItems = (await scrapers.searchWalmartAPI(simplifiedName, zipCode)) || []
            break
          case "Aldi":
            scrapedItems = (await scrapers.searchAldi(simplifiedName, zipCode)) || []
            break
          case "Safeway":
            scrapedItems = (await scrapers.searchSafeway(simplifiedName, zipCode)) || []
            break
          case "Trader Joes":
            scrapedItems = (await scrapers.searchTraderJoes(simplifiedName, zipCode)) || []
            break
        }
      }
    }

    // If we got results, cache the cheapest valid-priced one from this store
    if (scrapedItems && scrapedItems.length > 0) {
      const pricedItems = scrapedItems.filter((item) => {
        const numericPrice = Number(item?.price)
        return Number.isFinite(numericPrice) && numericPrice > 0
      })

      if (pricedItems.length === 0) {
        console.warn(`No valid priced results found for ${ingredientName} from ${store}`)
        return
      }

      // Find the cheapest item
      const cheapest = pricedItems.reduce((prev, current) => {
        const prevPrice = Number(prev.price)
        const currentPrice = Number(current.price)
        return currentPrice < prevPrice ? current : prev
      })

      const productName =
        (cheapest.product_name || cheapest.title || cheapest.name || ingredientName)?.toString().trim() || null
      const productIdRaw = cheapest.product_id ?? cheapest.id ?? null
      const productId = productIdRaw == null ? null : String(productIdRaw)

      // Cache the cheapest item for this ingredient from this store
      const successRow = await ingredientsHistoryDB.insertPrice({
        standardizedIngredientId: ingredientId,
        store,
        price: Number(cheapest.price),
        imageUrl: cheapest.image_url ?? null,
        productName,
        productId,
        location: cheapest.location ?? null,
        zipCode,
      })

      if (!successRow) {
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
