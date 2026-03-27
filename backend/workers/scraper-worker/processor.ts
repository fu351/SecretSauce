import {
  countScraperResults,
  resolveScraperWorkerMode,
  resolveScraperWorkerStore,
  sanitizeBatchQueries,
  type ScraperRuntimeOverrides,
  type ScraperWorkerMode,
  type ScraperWorkerProcessorJob,
  type ScraperWorkerProcessorResult,
  type ScraperWorkerStore,
} from "./worker"

interface ScraperWorkerModule {
  searchWalmartAPI: (query: string, zipCode?: string | null) => Promise<unknown>
  searchTarget: (query: string, storeMetadata?: unknown, zipCode?: string | null) => Promise<unknown>
  searchKroger: (zipCode: string | null | undefined, query: string) => Promise<unknown>
  searchMeijer: (zipCode: string | null | undefined, query: string) => Promise<unknown>
  search99Ranch: (query: string, zipCode?: string | null) => Promise<unknown>
  searchTraderJoes: (query: string, zipCode?: string | null) => Promise<unknown>
  searchAldi: (query: string, zipCode?: string | null) => Promise<unknown>
  searchAndronicos: (query: string, zipCode?: string | null) => Promise<unknown>
  searchWholeFoods: (query: string, zipCode?: string | null) => Promise<unknown>
  searchSafeway: (query: string, zipCode?: string | null) => Promise<unknown>
  searchKrogerBatch?: (queries: string[], zipCode?: string | null, options?: { concurrency?: number }) => Promise<unknown>
  searchMeijerBatch?: (queries: string[], zipCode?: string | null, options?: { concurrency?: number }) => Promise<unknown>
  search99RanchBatch?: (queries: string[], zipCode?: string | null, options?: { concurrency?: number }) => Promise<unknown>
  searchTraderJoesBatch?: (queries: string[], zipCode?: string | null, options?: { concurrency?: number }) => Promise<unknown>
  runWithUniversalScraperControls?: (overrides: ScraperRuntimeOverrides, fn: () => Promise<unknown>) => Promise<unknown>
}

export interface ScraperWorkerProcessorDependencies {
  loadModule?: () => ScraperWorkerModule
}

type SingleScraperFn = (module: ScraperWorkerModule, query: string, job: ScraperWorkerProcessorJob) => Promise<unknown>
type BatchScraperFn = (module: ScraperWorkerModule, queries: string[], job: ScraperWorkerProcessorJob) => Promise<unknown>

const SINGLE_SCRAPER_MAP: Record<ScraperWorkerStore, SingleScraperFn> = {
  walmart: (module, query, job) => module.searchWalmartAPI(query, job.zipCode),
  target: (module, query, job) => module.searchTarget(query, job.targetStoreMetadata ?? null, job.zipCode),
  kroger: (module, query, job) => module.searchKroger(job.zipCode, query),
  meijer: (module, query, job) => module.searchMeijer(job.zipCode, query),
  "99ranch": (module, query, job) => module.search99Ranch(query, job.zipCode),
  traderjoes: (module, query, job) => module.searchTraderJoes(query, job.zipCode),
  aldi: (module, query, job) => module.searchAldi(query, job.zipCode),
  andronicos: (module, query, job) => module.searchAndronicos(query, job.zipCode),
  wholefoods: (module, query, job) => module.searchWholeFoods(query, job.zipCode),
  safeway: (module, query, job) => module.searchSafeway(query, job.zipCode),
}

const BATCH_SCRAPER_MAP: Partial<Record<ScraperWorkerStore, BatchScraperFn>> = {
  kroger: async (module, queries, job) => {
    if (typeof module.searchKrogerBatch !== "function") {
      return Promise.all(queries.map((query) => module.searchKroger(job.zipCode, query)))
    }
    return module.searchKrogerBatch(queries, job.zipCode, { concurrency: job.batchConcurrency })
  },
  meijer: async (module, queries, job) => {
    if (typeof module.searchMeijerBatch !== "function") {
      return Promise.all(queries.map((query) => module.searchMeijer(job.zipCode, query)))
    }
    return module.searchMeijerBatch(queries, job.zipCode, { concurrency: job.batchConcurrency })
  },
  "99ranch": async (module, queries, job) => {
    if (typeof module.search99RanchBatch !== "function") {
      return Promise.all(queries.map((query) => module.search99Ranch(query, job.zipCode)))
    }
    return module.search99RanchBatch(queries, job.zipCode, { concurrency: job.batchConcurrency })
  },
  traderjoes: async (module, queries, job) => {
    if (typeof module.searchTraderJoesBatch !== "function") {
      return Promise.all(queries.map((query) => module.searchTraderJoes(query, job.zipCode)))
    }
    return module.searchTraderJoesBatch(queries, job.zipCode, { concurrency: job.batchConcurrency })
  },
}

function loadScraperWorkerModule(): ScraperWorkerModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("./index.js") as ScraperWorkerModule
}

async function runSingleStoreQuery(
  module: ScraperWorkerModule,
  store: ScraperWorkerStore,
  query: string,
  job: ScraperWorkerProcessorJob,
): Promise<unknown[]> {
  const scraperFn = SINGLE_SCRAPER_MAP[store]
  const results = await scraperFn(module, query, job)
  return Array.isArray(results) ? results : []
}

async function runBatchStoreQuery(
  module: ScraperWorkerModule,
  store: ScraperWorkerStore,
  queries: string[],
  job: ScraperWorkerProcessorJob,
): Promise<unknown[][]> {
  const batchFn = BATCH_SCRAPER_MAP[store]

  if (!batchFn) {
    const fallbackResults = await Promise.all(
      queries.map(async (query) => runSingleStoreQuery(module, store, query, job))
    )
    return fallbackResults
  }

  const result = await batchFn(module, queries, job)
  if (!Array.isArray(result)) {
    return []
  }

  return result.map((item) => (Array.isArray(item) ? item : []))
}

async function runWithRuntimeControls(
  module: ScraperWorkerModule,
  runtime: ScraperRuntimeOverrides | undefined,
  fn: () => Promise<unknown[] | unknown[][]>
): Promise<unknown[] | unknown[][]> {
  if (typeof module.runWithUniversalScraperControls !== "function") {
    return fn()
  }

  const wrapped = await module.runWithUniversalScraperControls(runtime ?? {}, fn)
  if (!Array.isArray(wrapped)) {
    return []
  }

  return wrapped as unknown[] | unknown[][]
}

export async function runScraperWorkerProcessor(
  job: ScraperWorkerProcessorJob,
  dependencies: ScraperWorkerProcessorDependencies = {}
): Promise<ScraperWorkerProcessorResult> {
  const store = resolveScraperWorkerStore(job.store)
  if (!store) {
    throw new Error(`Unsupported store: ${job.store}`)
  }

  const mode: ScraperWorkerMode = resolveScraperWorkerMode(job)
  const module = (dependencies.loadModule ?? loadScraperWorkerModule)()

  if (mode === "single") {
    const query = String(job.query || "").trim()
    if (!query) {
      throw new Error("query is required for single mode")
    }

    const results = (await runWithRuntimeControls(module, job.runtime, () =>
      runSingleStoreQuery(module, store, query, job)
    )) as unknown[]

    return {
      store,
      mode,
      query,
      results,
      totalItems: countScraperResults(results),
    }
  }

  const queries = sanitizeBatchQueries(job.queries)
  if (!queries.length) {
    throw new Error("queries is required for batch mode")
  }

  const results = (await runWithRuntimeControls(module, job.runtime, () =>
    runBatchStoreQuery(module, store, queries, job)
  )) as unknown[][]

  return {
    store,
    mode,
    queryCount: queries.length,
    results,
    totalItems: countScraperResults(results),
  }
}
