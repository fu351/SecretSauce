import {
  buildFrontendScraperRequestUrl,
  normalizeFrontendScraperItem,
  resolveFrontendScraperTimeoutMs,
  resolveFrontendScraperMaxResults,
  sortStoreResultsByTotal,
  type FrontendScraperSearchParams,
  type StoreResults,
} from "./utils"

export interface FrontendScraperApiResponse {
  message?: string
  results?: unknown[]
}

export interface FrontendScraperProcessorOptions {
  maxResultsPerStore?: number
}

export interface FrontendScraperFetchOptions extends FrontendScraperProcessorOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export function runFrontendScraperProcessor(
  payload: FrontendScraperApiResponse,
  options: FrontendScraperProcessorOptions = {}
): StoreResults[] {
  const rawResults = Array.isArray(payload?.results) ? payload.results : []
  if (!rawResults.length) return []

  const byStore = new Map<string, ReturnType<typeof normalizeFrontendScraperItem>[]>()
  for (const rawItem of rawResults) {
    const normalized = normalizeFrontendScraperItem(rawItem)
    const storeName = normalized.provider || normalized.location || "Unknown Store"
    if (!byStore.has(storeName)) {
      byStore.set(storeName, [])
    }
    byStore.get(storeName)!.push(normalized)
  }

  const maxResults = resolveFrontendScraperMaxResults(options.maxResultsPerStore)
  const storeResults: StoreResults[] = Array.from(byStore.entries()).map(([store, items]) => {
    const limitedItems = maxResults > 0 ? items.slice(0, maxResults) : items
    const total = limitedItems.reduce((sum, item) => sum + item.price, 0)
    return {
      store,
      items: limitedItems,
      total,
    }
  })

  return sortStoreResultsByTotal(storeResults)
}

export async function fetchFrontendScraperApiResponse(
  params: FrontendScraperSearchParams,
  options: FrontendScraperFetchOptions = {}
): Promise<FrontendScraperApiResponse> {
  const url = buildFrontendScraperRequestUrl(params)
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeoutMs = resolveFrontendScraperTimeoutMs(params.forceRefresh, options.timeoutMs)
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = (await response.json()) as FrontendScraperApiResponse
    if (data.message) {
      console.warn("[FrontendScraperProcessor] API message:", data.message)
    }

    return data
  } finally {
    clearTimeout(timeout)
  }
}

export async function runFrontendScraperSearch(
  params: FrontendScraperSearchParams,
  options: FrontendScraperFetchOptions = {}
): Promise<StoreResults[]> {
  const payload = await fetchFrontendScraperApiResponse(params, options)
  return runFrontendScraperProcessor(payload, {
    maxResultsPerStore: options.maxResultsPerStore,
  })
}
