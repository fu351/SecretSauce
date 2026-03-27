import {
  runFrontendScraperSearch,
  type FrontendScraperFetchOptions,
} from "./client-processor"
import type { FrontendScraperSearchParams, StoreResults } from "./utils"

export interface FrontendScraperRunnerInput extends FrontendScraperSearchParams {
  timeoutMs?: number
  maxResultsPerStore?: number
}

export async function runFrontendScraperRunner(
  input: FrontendScraperRunnerInput,
  options: Pick<FrontendScraperFetchOptions, "fetchImpl"> = {}
): Promise<StoreResults[]> {
  return runFrontendScraperSearch(input, {
    fetchImpl: options.fetchImpl,
    timeoutMs: input.timeoutMs,
    maxResultsPerStore: input.maxResultsPerStore,
  })
}

export async function searchGroceryStores(
  searchTerm: string,
  zipCode?: string,
  store?: string,
  forceRefresh?: boolean,
  standardizedIngredientId?: string | null
): Promise<StoreResults[]> {
  try {
    return await runFrontendScraperRunner({
      searchTerm,
      zipCode,
      store,
      forceRefresh,
      standardizedIngredientId,
    })
  } catch (error) {
    console.error("[FrontendScraperRunner] Error fetching grocery stores:", error)
    return []
  }
}

if (process.argv[1] && process.argv[1].includes("backend/workers/frontend-scraper-worker/runner")) {
  const searchTerm = process.env.FRONTEND_SCRAPER_SEARCH_TERM
  if (!searchTerm) {
    console.error("[FrontendScraperRunner] FRONTEND_SCRAPER_SEARCH_TERM is required")
    process.exit(1)
  }

  runFrontendScraperRunner({
    searchTerm,
    zipCode: process.env.FRONTEND_SCRAPER_ZIP_CODE,
    store: process.env.FRONTEND_SCRAPER_STORE,
    forceRefresh: process.env.FRONTEND_SCRAPER_FORCE_REFRESH === "true",
    standardizedIngredientId: process.env.FRONTEND_SCRAPER_STANDARDIZED_INGREDIENT_ID || null,
    timeoutMs: Number(process.env.FRONTEND_SCRAPER_TIMEOUT_MS || "") || undefined,
    maxResultsPerStore: Number(process.env.FRONTEND_SCRAPER_MAX_RESULTS || "") || undefined,
  })
    .then((results) => {
      console.log(
        `[FrontendScraperRunner] Completed search for \"${searchTerm}\" (stores=${results.length})`
      )
    })
    .catch((error) => {
      console.error("[FrontendScraperRunner] Unhandled error:", error)
      process.exit(1)
    })
}
