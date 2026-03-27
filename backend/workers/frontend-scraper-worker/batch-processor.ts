import {
  getOrRefreshIngredientPricesForStores,
  type IngredientCacheResult,
} from "../scraper-worker/ingredient-pipeline"
import { normalizeZipCode } from "../../../lib/utils/zip"
import { recipeIngredientsDB } from "../../../lib/database/recipe-ingredients-db"
import { ingredientsHistoryDB } from "../../../lib/database/ingredients-db"
import {
  buildFailedIngredientResult,
  resolveBatchIngredientInput,
  resolveBatchScraperStores,
  summarizeFrontendBatchScraperResults,
  type FrontendBatchScraperProcessorInput,
  type FrontendBatchScraperProcessorOutput,
  type IngredientResult,
  type StoreResult,
} from "./batch-utils"

async function findRecipeStandardizedIngredientId(recipeId: string, rawName: string): Promise<string | null> {
  if (!recipeId) return null
  const trimmed = rawName?.trim()
  if (!trimmed) return null

  const entry = await recipeIngredientsDB.findByRecipeIdAndDisplayName(recipeId, trimmed)
  return entry?.standardized_ingredient_id ?? null
}

async function resolveStandardizedIngredientId(ingredientName: string, recipeId?: string): Promise<string | null> {
  if (recipeId) {
    const fromRecipe = await findRecipeStandardizedIngredientId(recipeId, ingredientName)
    if (fromRecipe) return fromRecipe
  }

  return ingredientsHistoryDB.resolveStandardizedIngredientId(ingredientName)
}

function buildIngredientResultFromRows(
  ingredientName: string,
  stores: string[],
  rows: IngredientCacheResult[]
): IngredientResult {
  const storeResultsMap = new Map<string, StoreResult>()

  stores.forEach((store) => {
    storeResultsMap.set(store, {
      store,
      success: false,
      cached: false,
      error: "No data returned",
    })
  })

  rows.forEach((row) => {
    const storeName = row.store.toLowerCase()
    storeResultsMap.set(storeName, {
      store: storeName,
      success: true,
      cached: row.from_cache || false,
      price: Number(row.price) || undefined,
    })
  })

  const storeResults = Array.from(storeResultsMap.values())
  const successfulStores = storeResults.filter((result) => result.success).length
  const cachedStores = storeResults.filter((result) => result.cached).length

  return {
    ingredient: ingredientName,
    totalStores: stores.length,
    successfulStores,
    cachedStores,
    failedStores: storeResults.length - successfulStores,
    stores: storeResults,
  }
}

export async function runFrontendBatchScraperProcessor(
  input: FrontendBatchScraperProcessorInput
): Promise<FrontendBatchScraperProcessorOutput> {
  const startTime = Date.now()
  const zipCode = normalizeZipCode(input.zipCode)
  const stores = resolveBatchScraperStores(input.stores)

  if (!zipCode) {
    throw new Error("zipCode is required")
  }

  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw new Error("ingredients array is required")
  }

  console.log(`[Batch Scraper] Processing ${input.ingredients.length} ingredients for zip ${zipCode}`)

  const results = await Promise.all(
    input.ingredients.map(async (rawItem) => {
      const item = resolveBatchIngredientInput(rawItem)
      const ingredientName = item.name

      if (!ingredientName) {
        return buildFailedIngredientResult("", stores, "Ingredient name is required")
      }

      console.log(`[Batch Scraper] Processing: ${ingredientName}`)

      try {
        const standardizedIngredientId = await resolveStandardizedIngredientId(ingredientName, item.recipeId)

        if (!standardizedIngredientId) {
          console.warn(`[Batch Scraper] Could not resolve standardized ID for ${ingredientName}`)
          return buildFailedIngredientResult(ingredientName, stores, "Could not resolve standardized ingredient ID")
        }

        const rows = await getOrRefreshIngredientPricesForStores(
          standardizedIngredientId,
          stores,
          { zipCode, forceRefresh: input.forceRefresh === true }
        )

        const result = buildIngredientResultFromRows(ingredientName, stores, rows)

        console.log(
          `[Batch Scraper] ${ingredientName}: ${result.successfulStores}/${stores.length} stores successful ` +
            `(${result.cachedStores} cached)`
        )

        return result
      } catch (error) {
        console.error(`[Batch Scraper] Error processing ${ingredientName}:`, error)
        return buildFailedIngredientResult(
          ingredientName,
          stores,
          error instanceof Error ? error.message : "Unknown error"
        )
      }
    })
  )

  const durationMs = Date.now() - startTime
  const summary = summarizeFrontendBatchScraperResults(results, stores.length, durationMs)

  console.log(
    `[Batch Scraper] Complete: ${summary.successful}/${summary.totalAttempts} successful in ${summary.durationMs}ms`
  )
  console.log(
    `[Batch Scraper] Breakdown: ${summary.cached} cached, ${summary.scraped} scraped, ${summary.failed} failed`
  )

  return {
    summary,
    results,
    zipCode,
  }
}
