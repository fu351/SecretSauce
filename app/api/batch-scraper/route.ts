import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/database/supabase"
import {
  getOrRefreshIngredientPricesForStores,
  resolveStandardizedIngredientForRecipe,
  type IngredientCacheResult,
} from "@/lib/ingredient-pipeline"
import { normalizeZipCode } from "@/lib/utils/zip"

const DEFAULT_STORE_KEYS = [
  "walmart",
  "target",
  "kroger",
  "meijer",
  "99ranch",
  "traderjoes",
  "aldi",
  "safeway",
]

const FALLBACK_BATCH_ZIP = normalizeZipCode(process.env.ZIP_CODE ?? process.env.DEFAULT_ZIP_CODE)

interface BatchIngredient {
  name: string
  recipeId?: string
}

interface StoreResult {
  store: string
  success: boolean
  cached: boolean
  price?: number
  error?: string
}

interface IngredientResult {
  ingredient: string
  totalStores: number
  successfulStores: number
  cachedStores: number
  failedStores: number
  stores: StoreResult[]
}

/**
 * Batch Ingredient Scraper API
 *
 * Optimized endpoint for daily scraping that:
 * - Processes multiple ingredients in parallel
 * - Searches all stores per ingredient in parallel
 * - Uses existing cache infrastructure
 * - Returns detailed success/failure stats
 *
 * Used by GitHub Actions daily scraper workflow
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Authentication check - require CRON_SECRET for automated scraping
    const authHeader = request.headers.get("authorization")
    const expectedSecret = process.env.CRON_SECRET

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid CRON_SECRET" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { ingredients, zipCode, forceRefresh = false } = body as {
      ingredients: BatchIngredient[]
      zipCode?: string
      forceRefresh?: boolean
    }
    const requestedZip = normalizeZipCode(zipCode)
    const zipToUse = requestedZip ?? FALLBACK_BATCH_ZIP

    if (!zipToUse) {
      return NextResponse.json(
        { error: "zipCode is required" },
        { status: 400 }
      )
    }

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json(
        { error: "ingredients array is required" },
        { status: 400 }
      )
    }

    console.log(`[Batch Scraper] Processing ${ingredients.length} ingredients for zip ${zipToUse}`)

    const supabaseClient = createServerClient()
    const results: IngredientResult[] = []

    // Process all ingredients in parallel
    const ingredientPromises = ingredients.map(async (item) => {
      const ingredientName = typeof item === "string" ? item : item.name
      const recipeId = typeof item === "object" ? item.recipeId : undefined

      console.log(`[Batch Scraper] Processing: ${ingredientName}`)

      try {
        // Resolve standardized ingredient ID
        let standardizedIngredientId: string | null = null

        if (recipeId) {
          standardizedIngredientId = await resolveStandardizedIngredientForRecipe(
            recipeId,
            ingredientName
          )
        }

        if (!standardizedIngredientId) {
          const canonical = ingredientName
            .toLowerCase()
            .replace(/\(.*?\)/g, " ")
            .replace(/[^a-z0-9\s]/g, " ")
            .trim()
            .replace(/\s+/g, " ")

          const { data: existing } = await supabaseClient
            .from("standardized_ingredients")
            .select("id")
            .eq("canonical_name", canonical)
            .maybeSingle()

          if (existing?.id) {
            standardizedIngredientId = existing.id
          } else {
            const { data: inserted } = await supabaseClient
              .from("standardized_ingredients")
              .insert({ canonical_name: canonical })
              .select("id")
              .maybeSingle()
            standardizedIngredientId = inserted?.id || null
          }
        }

        if (!standardizedIngredientId) {
          console.warn(`[Batch Scraper] Could not resolve standardized ID for ${ingredientName}`)
          return {
            ingredient: ingredientName,
            totalStores: DEFAULT_STORE_KEYS.length,
            successfulStores: 0,
            cachedStores: 0,
            failedStores: DEFAULT_STORE_KEYS.length,
            stores: DEFAULT_STORE_KEYS.map(store => ({
              store,
              success: false,
              cached: false,
              error: "Could not resolve standardized ingredient ID"
            }))
          }
        }

        // Fetch/scrape prices for all stores in parallel
        const cachedRows: IngredientCacheResult[] = await getOrRefreshIngredientPricesForStores(
          standardizedIngredientId,
          DEFAULT_STORE_KEYS,
          { zipCode: zipToUse, forceRefresh }
        )

        // Build result map
        const storeResultsMap = new Map<string, StoreResult>()

        // Mark all stores as failed initially
        DEFAULT_STORE_KEYS.forEach(store => {
          storeResultsMap.set(store, {
            store,
            success: false,
            cached: false,
            error: "No data returned"
          })
        })

        // Update with successful results
        cachedRows.forEach(row => {
          const storeName = row.store.toLowerCase()
          storeResultsMap.set(storeName, {
            store: storeName,
            success: true,
            cached: row.from_cache || false,
            price: Number(row.price) || undefined
          })
        })

        const storeResults = Array.from(storeResultsMap.values())
        const successfulStores = storeResults.filter(r => r.success).length
        const cachedStores = storeResults.filter(r => r.cached).length
        const failedStores = storeResults.filter(r => !r.success).length

        const result: IngredientResult = {
          ingredient: ingredientName,
          totalStores: DEFAULT_STORE_KEYS.length,
          successfulStores,
          cachedStores,
          failedStores,
          stores: storeResults
        }

        console.log(`[Batch Scraper] ${ingredientName}: ${successfulStores}/${DEFAULT_STORE_KEYS.length} stores successful (${cachedStores} cached)`)

        return result
      } catch (error) {
        console.error(`[Batch Scraper] Error processing ${ingredientName}:`, error)
        return {
          ingredient: ingredientName,
          totalStores: DEFAULT_STORE_KEYS.length,
          successfulStores: 0,
          cachedStores: 0,
          failedStores: DEFAULT_STORE_KEYS.length,
          stores: DEFAULT_STORE_KEYS.map(store => ({
            store,
            success: false,
            cached: false,
            error: error instanceof Error ? error.message : "Unknown error"
          }))
        }
      }
    })

    // Wait for all ingredients to complete
    const ingredientResults = await Promise.all(ingredientPromises)

    // Calculate summary stats
    const totalIngredients = ingredientResults.length
    const totalAttempts = totalIngredients * DEFAULT_STORE_KEYS.length
    const totalSuccessful = ingredientResults.reduce((sum, r) => sum + r.successfulStores, 0)
    const totalCached = ingredientResults.reduce((sum, r) => sum + r.cachedStores, 0)
    const totalFailed = ingredientResults.reduce((sum, r) => sum + r.failedStores, 0)
    const totalScraped = totalSuccessful - totalCached

    const duration = Date.now() - startTime

    console.log(`[Batch Scraper] Complete: ${totalSuccessful}/${totalAttempts} successful in ${duration}ms`)
    console.log(`[Batch Scraper] Breakdown: ${totalCached} cached, ${totalScraped} scraped, ${totalFailed} failed`)

    return NextResponse.json({
      success: true,
      summary: {
        totalIngredients,
        totalStores: DEFAULT_STORE_KEYS.length,
        totalAttempts,
        successful: totalSuccessful,
        cached: totalCached,
        scraped: totalScraped,
        failed: totalFailed,
        successRate: ((totalSuccessful / totalAttempts) * 100).toFixed(1) + "%",
        durationMs: duration
      },
      results: ingredientResults,
      zipCode: zipToUse
    })

  } catch (error) {
    console.error("[Batch Scraper] Fatal error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    endpoint: "batch-scraper",
    status: "healthy",
    description: "Batch ingredient scraper for daily price updates"
  })
}
