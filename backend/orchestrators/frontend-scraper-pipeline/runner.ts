import {
  runFrontendScraperSearch,
  type FrontendScraperFetchOptions,
} from "../../workers/frontend-scraper-worker/client-processor"
import type { FrontendScraperSearchParams, StoreResults } from "../../workers/frontend-scraper-worker/utils"

export interface FrontendScraperPipelineRunnerInput extends FrontendScraperSearchParams {
  timeoutMs?: number
  maxResultsPerStore?: number
}

export async function runFrontendScraperPipelineRunner(
  input: FrontendScraperPipelineRunnerInput,
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
    return await runFrontendScraperPipelineRunner({
      searchTerm,
      zipCode,
      store,
      forceRefresh,
      standardizedIngredientId,
    })
  } catch (error) {
    console.error("[FrontendScraperPipelineRunner] Error fetching grocery stores:", error)
    return []
  }
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+frontend-scraper-pipeline[\\/]+runner(?:\.ts)?$/i.test(process.argv[1])
) {
  const searchTerm = process.env.FRONTEND_SCRAPER_SEARCH_TERM
  if (!searchTerm) {
    console.error("[FrontendScraperPipelineRunner] FRONTEND_SCRAPER_SEARCH_TERM is required")
    process.exit(1)
  }

  runFrontendScraperPipelineRunner({
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
        `[FrontendScraperPipelineRunner] Completed search for "${searchTerm}" (stores=${results.length})`
      )
    })
    .catch((error) => {
      console.error("[FrontendScraperPipelineRunner] Unhandled error:", error)
      process.exit(1)
    })
}
