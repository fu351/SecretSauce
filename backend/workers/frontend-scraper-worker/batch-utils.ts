export const DEFAULT_BATCH_SCRAPER_STORES = [
  "walmart",
  "target",
  "kroger",
  "meijer",
  "99ranch",
  "traderjoes",
  "aldi",
  "safeway",
]

export interface BatchIngredient {
  name: string
  recipeId?: string
}

export interface StoreResult {
  store: string
  success: boolean
  cached: boolean
  price?: number
  error?: string
}

export interface IngredientResult {
  ingredient: string
  totalStores: number
  successfulStores: number
  cachedStores: number
  failedStores: number
  stores: StoreResult[]
}

export interface FrontendBatchScraperProcessorInput {
  ingredients: Array<BatchIngredient | string>
  zipCode: string
  forceRefresh?: boolean
  stores?: string[]
}

export interface FrontendBatchScraperSummary {
  totalIngredients: number
  totalStores: number
  totalAttempts: number
  successful: number
  cached: number
  scraped: number
  failed: number
  successRate: string
  durationMs: number
}

export interface FrontendBatchScraperProcessorOutput {
  summary: FrontendBatchScraperSummary
  results: IngredientResult[]
  zipCode: string
}

export function resolveBatchIngredientInput(item: BatchIngredient | string): BatchIngredient {
  if (typeof item === "string") {
    return { name: item }
  }

  return {
    name: String(item?.name || "").trim(),
    recipeId: item?.recipeId,
  }
}

export function resolveBatchScraperStores(stores?: string[]): string[] {
  if (!Array.isArray(stores) || stores.length === 0) {
    return [...DEFAULT_BATCH_SCRAPER_STORES]
  }

  const normalized = stores
    .map((store) => String(store || "").trim().toLowerCase())
    .filter(Boolean)

  return normalized.length > 0 ? normalized : [...DEFAULT_BATCH_SCRAPER_STORES]
}

export function buildFailedIngredientResult(ingredientName: string, stores: string[], error: string): IngredientResult {
  return {
    ingredient: ingredientName,
    totalStores: stores.length,
    successfulStores: 0,
    cachedStores: 0,
    failedStores: stores.length,
    stores: stores.map((store) => ({
      store,
      success: false,
      cached: false,
      error,
    })),
  }
}

export function summarizeFrontendBatchScraperResults(
  results: IngredientResult[],
  storeCount: number,
  durationMs: number
): FrontendBatchScraperSummary {
  const totalIngredients = results.length
  const totalAttempts = totalIngredients * storeCount
  const successful = results.reduce((sum, result) => sum + result.successfulStores, 0)
  const cached = results.reduce((sum, result) => sum + result.cachedStores, 0)
  const failed = results.reduce((sum, result) => sum + result.failedStores, 0)

  return {
    totalIngredients,
    totalStores: storeCount,
    totalAttempts,
    successful,
    cached,
    scraped: successful - cached,
    failed,
    successRate: totalAttempts > 0 ? `${((successful / totalAttempts) * 100).toFixed(1)}%` : "0.0%",
    durationMs,
  }
}
