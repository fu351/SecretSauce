import { auth } from "@clerk/nextjs/server"
import {
  getOrRefreshIngredientPricesForStores,
  type IngredientCacheResult,
} from "../scraper-worker/ingredient-pipeline"
import { createAnonSupabaseClient, createUserSupabaseClient } from "../../../lib/database/supabase-server"
import { normalizeZipCode } from "../../../lib/utils/zip"
import { normalizeStoreName, ingredientsRecentDB, ingredientsHistoryDB } from "../../../lib/database/ingredients-db"
import { profileDB } from "../../../lib/database/profile-db"
import {
  buildStoreMetadataFromStoreData,
  type StoreMetadataMap,
} from "../scraper-worker/utils/store-metadata"
import { getUserPreferredStores, type StoreData } from "../scraper-worker/utils/user-preferred-stores"
import { resolveRawUnitWithDailyScraperPriority } from "../scraper-worker/utils/daily-scraper-raw-unit"

const DEFAULT_STORE_KEYS = [
  "walmart",
  "target",
  "kroger",
  "meijer",
  "99ranch",
  "traderjoes",
  "aldi",
  "andronicos",
  "wholefoods",
  "safeway",
]

const ROUTE_MAX_RESULTS_PER_STORE = Number(process.env.SCRAPER_MAX_RESULTS || 10)

type ScraperRuntimeConfig = {
  liveActivation?: boolean
  bypassTimeouts?: boolean
  timeoutMultiplier?: number
  timeoutFloorMs?: number
}

type DirectFallbackItem = {
  id: string
  title: string
  price: number
  unit?: string | null
  rawUnit?: string | null
  pricePerUnit?: string | null
  image_url?: string | null
  provider: string
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  fromCache?: boolean
}

export interface FrontendScraperApiProcessorResult {
  status: number
  body: Record<string, unknown>
}

type GrocerySearchResultItem = {
  provider: string
  [key: string]: unknown
}

async function withScraperRuntimeContext<T>(
  runtimeConfig: ScraperRuntimeConfig | null,
  fn: () => Promise<T>
): Promise<T> {
  if (!runtimeConfig) return fn()

  const { runWithUniversalScraperControls } = require("@/backend/workers/scraper-worker/universal-controls")
  return runWithUniversalScraperControls(runtimeConfig, fn)
}

async function scrapeDirectFallback(
  term: string,
  stores: string[],
  zip?: string,
  standardizedIngredientId?: string | null,
  preferredStoresMap?: Map<string, StoreData>,
): Promise<DirectFallbackItem[]> {
  try {
    const scrapers = require("@/backend/workers/scraper-worker")
    const scraperMap: Record<string, (...args: any[]) => Promise<unknown>> = {
      walmart: scrapers.searchWalmartAPI,
      target: scrapers.searchTarget,
      kroger: scrapers.searchKroger,
      meijer: scrapers.searchMeijer,
      "99ranch": scrapers.search99Ranch,
      ranch99: scrapers.search99Ranch,
      traderjoes: scrapers.searchTraderJoes,
      aldi: scrapers.searchAldi,
      andronicos: scrapers.searchAndronicos,
      wholefoods: scrapers.searchWholeFoods,
      safeway: scrapers.searchSafeway,
    }

    const results: DirectFallbackItem[] = []
    const storesToScrape: string[] = []
    const cachedStores: string[] = []

    if (standardizedIngredientId) {
      const cachedItems = await ingredientsRecentDB.findByStandardizedId(
        standardizedIngredientId,
        stores,
        zip,
      )

      const cachedByStore = new Map<string, any>()
      for (const cached of cachedItems || []) {
        const key = cached.store?.toLowerCase?.() || cached.store
        if (key && !cachedByStore.has(key)) {
          cachedByStore.set(key, cached)
        }
      }

      for (const store of stores) {
        const cached = cachedByStore.get(store.toLowerCase())
        if (cached) {
          const metadataKey = normalizeStoreName(store)
          const storeData = preferredStoresMap?.get(metadataKey)

          results.push({
            id: cached.product_id || cached.id,
            title: cached.product_name || term,
            price: Number(cached.price) || 0,
            unit: cached.unit || null,
            rawUnit: resolveRawUnitWithDailyScraperPriority(cached),
            pricePerUnit: cached.unit_price ? `$${cached.unit_price}/${cached.unit}` : null,
            image_url: cached.image_url || null,
            provider: store,
            location: cached.location || null,
            latitude: storeData?.latitude,
            longitude: storeData?.longitude,
            fromCache: true,
          })
          cachedStores.push(store)
        } else {
          storesToScrape.push(store)
        }
      }

      console.log("[grocery-search] Cache check complete", {
        cachedStores,
        storesToScrape,
        term,
      })
    } else {
      storesToScrape.push(...stores)
    }

    const scrapePromises = storesToScrape
      .filter((store) => Boolean(scraperMap[store]))
      .map(async (store) => {
        const scraper = scraperMap[store]

        try {
          const metadataKey = normalizeStoreName(store)
          const storeData = preferredStoresMap?.get(metadataKey)
          const storeZip = storeData?.zip_code || zip
          const storeLocation = storeData && storeData.address && storeData.city && storeData.state && storeData.zip_code
            ? `${storeData.address}, ${storeData.city}, ${storeData.state} ${storeData.zip_code}`
            : null

          console.log(`[scrapeDirectFallback] Scraping ${store} with ${storeData ? "database" : "fallback"} zip: ${storeZip}`)

          let data: any[] = []
          if (store === "kroger" || store === "meijer") {
            data = ((await scraper(storeZip, term)) || []) as any[]
          } else if (store === "target") {
            data = ((await scraper(term, null, storeZip)) || []) as any[]
          } else {
            data = ((await scraper(term, storeZip)) || []) as any[]
          }

          if (!Array.isArray(data)) return []

          const mapped = data.map((item: any) => ({
            id: item.id || `${store}-${Math.random()}`,
            title: item.title || item.name || term,
            price: Number(item.price) || 0,
            unit: item.unit || null,
            rawUnit: resolveRawUnitWithDailyScraperPriority(item),
            pricePerUnit: item.pricePerUnit || null,
            image_url: item.image_url || null,
            provider: store,
            location: storeLocation || item.location || null,
            latitude: storeData?.latitude,
            longitude: storeData?.longitude,
            fromCache: false,
          }))

          console.log("[scrapeDirectFallback] Results", { store, count: mapped.length })
          return mapped
        } catch (error) {
          console.warn("[grocery-search] Fallback scraper error", { store, error })
          return []
        }
      })

    const scrapeResults = await Promise.all(scrapePromises)
    for (const storeResults of scrapeResults) {
      results.push(...storeResults)
    }

    return results
  } catch (error) {
    console.error("[grocery-search] Failed fallback scraping", error)
    return []
  }
}

function mapStoreKeyToName(storeKey: string): string {
  const storeMap: Record<string, string> = {
    target: "Target",
    kroger: "Kroger",
    meijer: "Meijer",
    "99ranch": "99 Ranch",
    walmart: "Walmart",
    traderjoes: "Trader Joe's",
    aldi: "Aldi",
    andronicos: "Andronico's Community Markets",
    wholefoods: "Whole Foods",
    safeway: "Safeway",
  }
  return storeMap[storeKey] || storeKey
}

function getStoreLocationLabel(storeName: string, zipCode?: string): string {
  if (zipCode) {
    return `${storeName} (${zipCode})`
  }
  return `${storeName} Grocery`
}

function resolveStoreKey(storeParam: string): string | null {
  if (!storeParam) return null
  const value = storeParam.toLowerCase()
  if (value.includes("target")) return "target"
  if (value.includes("kroger")) return "kroger"
  if (value.includes("meijer")) return "meijer"
  if (value.includes("99") || value.includes("ranch")) return "99ranch"
  if (value.includes("walmart")) return "walmart"
  if (value.includes("trader")) return "traderjoes"
  if (value.includes("aldi")) return "aldi"
  if (value.includes("andronico")) return "andronicos"
  if (value.includes("safeway")) return "safeway"
  if (value.includes("whole")) return "wholefoods"
  return null
}

function limitResultsPerStore<T extends { provider: string }>(items: T[]): T[] {
  if (ROUTE_MAX_RESULTS_PER_STORE <= 0) return items
  const seen = new Map<string, number>()
  return items.filter((item) => {
    const count = seen.get(item.provider) ?? 0
    if (count >= ROUTE_MAX_RESULTS_PER_STORE) return false
    seen.set(item.provider, count + 1)
    return true
  })
}

function formatCacheResults(
  cachedItems: IngredientCacheResult[],
  fallbackName: string,
  zipCode: string,
): GrocerySearchResultItem[] {
  return cachedItems.map((item) => {
    const storeName = mapStoreKeyToName(item.store.toLowerCase().trim())
    const quantityDisplay = `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
    const fallbackTitle = `${fallbackName || item.product_name || "Ingredient"} (${quantityDisplay})`
    const locationHint = item.location || getStoreLocationLabel(storeName, zipCode)

    return {
      id: item.product_id || item.id,
      title: item.product_name || fallbackTitle,
      brand: "",
      price: Number(item.price) || 0,
      pricePerUnit: item.unit_price ? `$${item.unit_price}/${item.unit}` : undefined,
      unit: item.unit,
      rawUnit: item.unit || undefined,
      image_url: item.image_url || "/placeholder.svg",
      product_url: (item as any).product_url,
      provider: storeName,
      location: locationHint,
      category: "Grocery",
    }
  })
}

function formatDirectItems(
  items: DirectFallbackItem[],
  options: { useItemLocationFallback: boolean }
): GrocerySearchResultItem[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    brand: "",
    price: item.price,
    pricePerUnit: item.pricePerUnit || (item.unit ? `${item.price}/${item.unit}` : undefined),
    unit: item.unit || "",
    rawUnit: item.rawUnit || item.unit || "",
    image_url: item.image_url || "/placeholder.svg",
    provider: mapStoreKeyToName(item.provider.toLowerCase()),
    location: options.useItemLocationFallback
      ? item.location || `${mapStoreKeyToName(item.provider.toLowerCase())} Grocery`
      : `${mapStoreKeyToName(item.provider.toLowerCase())} Grocery`,
    category: "Grocery",
  }))
}

export async function runFrontendScraperApiProcessor(
  requestUrl: string
): Promise<FrontendScraperApiProcessorResult> {
  const requestStart = Date.now()
  console.log("[grocery-search] API endpoint hit", { timestamp: new Date().toISOString() })

  const clerkAuthState = await auth()
  const hasClerkSession = Boolean(clerkAuthState.userId)

  const { searchParams } = new URL(requestUrl)
  const rawSearchTerm = searchParams.get("searchTerm") || ""
  const sanitizedSearchTerm = (rawSearchTerm.split(",")[0] || "").trim() || rawSearchTerm.trim()
  const zipParam = searchParams.get("zipCode") || ""
  let zipToUse = normalizeZipCode(zipParam)

  const standardizedIngredientIdParam = searchParams.get("standardizedIngredientId")?.trim() || null
  const rawStoreParam = (searchParams.get("store") || "").trim()
  const storeKey = resolveStoreKey(rawStoreParam)
  const storeKeys = storeKey ? [storeKey] : DEFAULT_STORE_KEYS
  const forceRefresh = searchParams.get("forceRefresh") === "true"
  const liveActivation = searchParams.get("liveActivation") === "true" || forceRefresh
  const scraperRuntimeConfig: ScraperRuntimeConfig | null = liveActivation
    ? { liveActivation: true }
    : null

  if (rawStoreParam) {
    console.log(`[grocery-search] Store mapping: "${rawStoreParam}" -> "${storeKey}"`)
  }

  const supabaseClient = hasClerkSession
    ? createUserSupabaseClient()
    : createAnonSupabaseClient()

  let profileZip: string | null = null
  let userId: string | null = clerkAuthState.userId || null

  if (hasClerkSession) {
    try {
      if (userId && !zipToUse) {
        const profile = await profileDB.fetchProfileFields(userId, ["zip_code"])
        profileZip = normalizeZipCode(profile?.zip_code) ?? null
        if (profileZip) {
          zipToUse = profileZip
          console.log("[grocery-search] Using profile zip code as fallback", { profileZip })
        }
      } else if (zipToUse) {
        console.log("[grocery-search] Using explicitly provided zip code", { zipToUse })
      }
    } catch (error) {
      console.warn("[grocery-search] Failed to derive zip from current user profile", error)
    }
  } else if (zipToUse) {
    console.log("[grocery-search] Using explicitly provided zip code", { zipToUse })
  }

  console.log("[grocery-search] Resolved zip code", { zipToUse })

  if (!zipToUse) {
    return {
      status: 400,
      body: { error: "Zip code is required" },
    }
  }

  if (!sanitizedSearchTerm) {
    return {
      status: 400,
      body: { error: "Search term is required" },
    }
  }

  const preferredStoresMap = await getUserPreferredStores(
    supabaseClient,
    userId,
    storeKeys,
    zipToUse,
  )

  const preferredStoreMetadata: StoreMetadataMap = buildStoreMetadataFromStoreData(preferredStoresMap)
  const cacheLookupOptions = {
    zipCode: zipToUse,
    allowRealTimeScraping: true,
    storeMetadata: preferredStoreMetadata,
  }

  let standardizedIngredientId: string | null = standardizedIngredientIdParam
  let cachedRows: IngredientCacheResult[] = []

  console.log("[grocery-search] Incoming request", {
    searchTerm: sanitizedSearchTerm,
    zipParam,
    zipToUse,
    standardizedIngredientId,
    stores: storeKeys,
    forceRefresh,
    liveActivation,
  })

  if (forceRefresh) {
    console.log("[grocery-search] Force refresh requested, bypassing cache and scraping directly")

    const directItems = await withScraperRuntimeContext(scraperRuntimeConfig, () =>
      scrapeDirectFallback(sanitizedSearchTerm, storeKeys, zipToUse, null, preferredStoresMap)
    )

    if (directItems.length === 0) {
      console.warn("[grocery-search] Force refresh produced 0 items", {
        term: sanitizedSearchTerm,
        stores: storeKeys,
        zip: zipToUse,
      })
    } else {
      console.log("[grocery-search] Force refresh scraped items", {
        term: sanitizedSearchTerm,
        count: directItems.length,
        storesReturned: [...new Set(directItems.map((item) => item.provider))],
      })
    }

    if (directItems.length > 0) {
      if (standardizedIngredientId) {
        Promise.resolve()
          .then(async () => {
            const payloads = directItems.map((item) => {
              const metadataKey = normalizeStoreName(item.provider)
              const storeInfo = preferredStoresMap.get(metadataKey)
              const groceryStoreId = storeInfo?.storeId ?? storeInfo?.grocery_store_id ?? null
              const storeZip = storeInfo?.zip_code ?? zipToUse

              return {
                standardizedIngredientId: standardizedIngredientId!,
                store: item.provider.toLowerCase(),
                productName: item.title,
                price: item.price,
                quantity: 1,
                unit: item.unit || "unit",
                rawUnit: item.rawUnit ?? item.unit ?? null,
                unitPrice: item.pricePerUnit
                  ? Number(String(item.pricePerUnit).replace(/[^0-9.]/g, ""))
                  : null,
                imageUrl: item.image_url || null,
                productId: item.id,
                productMappingId: null,
                location: item.location || null,
                zipCode: storeZip || null,
                groceryStoreId,
              }
            })

            await ingredientsHistoryDB.batchInsertPrices(payloads)
            console.log("[grocery-search] Force refresh cache update complete", { itemCount: directItems.length })
          })
          .catch((error) => console.error("[grocery-search] Force refresh cache write failed", error))
      }

      return {
        status: 200,
        body: {
          results: limitResultsPerStore(formatDirectItems(directItems, { useItemLocationFallback: true })),
          cached: false,
          source: "scraper-force-refresh",
        },
      }
    }

    return {
      status: 200,
      body: {
        results: [],
        cached: false,
        source: "unavailable",
        message: "No prices available right now. Please try again.",
      },
    }
  }

  try {
    if (standardizedIngredientId) {
      const standardizedIdForLookup = standardizedIngredientId

      console.log("[grocery-search] Fetching cache/scrape for all stores (batched)", {
        stores: storeKeys,
        standardizedIngredientId: standardizedIdForLookup,
        zipToUse,
      })

      cachedRows = await withScraperRuntimeContext(scraperRuntimeConfig, () =>
        getOrRefreshIngredientPricesForStores(
          standardizedIdForLookup,
          storeKeys,
          cacheLookupOptions,
        )
      )

      const cacheHitStores = cachedRows.map((row) => row.store)
      const cacheMissStores = storeKeys.filter(
        (store) => !cachedRows.some((row) => row.store.toLowerCase() === store.toLowerCase())
      )

      console.log("[grocery-search] Batch fetch completed", {
        searchTerm: sanitizedSearchTerm,
        standardizedIngredientId,
        totalStores: storeKeys.length,
        cacheHits: cacheHitStores.length,
        cacheMisses: cacheMissStores.length,
        cacheHitStores,
        cacheMissStores,
        hitRate: `${((cacheHitStores.length / storeKeys.length) * 100).toFixed(1)}%`,
      })

      if (cacheMissStores.length > 0) {
        console.warn("[grocery-search] Cache misses detected", {
          searchTerm: sanitizedSearchTerm,
          standardizedIngredientId,
          missedStores: cacheMissStores,
          message: "These stores are missing from cache - daily scraper should have populated them",
        })
      }
    } else {
      console.log("[grocery-search] No standardized ID available; skipping cache pipeline")
    }
  } catch (error) {
    console.error("[grocery-search] Pipeline error", error)
  }

  if (!cachedRows || cachedRows.length === 0) {
    console.warn("[grocery-search] No cached/scraped results via pipeline, attempting direct scrapers", {
      searchTerm: sanitizedSearchTerm,
      zipToUse,
      standardizedIngredientId,
      stores: storeKeys,
    })

    const directItems = await withScraperRuntimeContext(scraperRuntimeConfig, () =>
      scrapeDirectFallback(
        sanitizedSearchTerm,
        storeKeys,
        zipToUse,
        standardizedIngredientId,
        preferredStoresMap,
      )
    )

    if (directItems.length > 0) {
      Promise.resolve()
        .then(async () => {
          console.log("[grocery-search] Starting background cache write for direct scraper results", {
            itemCount: directItems.length,
            searchTerm: sanitizedSearchTerm,
          })

          const standardizedId = standardizedIngredientId
          if (!standardizedId) {
            console.warn("[grocery-search] Could not resolve standardized ID for caching", {
              searchTerm: sanitizedSearchTerm,
            })
            return
          }

          console.log("[grocery-search] Resolved standardized ID for caching", {
            standardizedId,
            searchTerm: sanitizedSearchTerm,
          })

          const freshItems = directItems.filter((item) => !item.fromCache)
          const payloads = freshItems.map((item) => {
            const metadataKey = normalizeStoreName(item.provider)
            const storeInfo = preferredStoresMap.get(metadataKey)
            const groceryStoreId = storeInfo?.storeId ?? storeInfo?.grocery_store_id ?? null
            const storeZip = storeInfo?.zip_code ?? zipToUse

            return {
              standardizedIngredientId: standardizedId,
              store: item.provider.toLowerCase(),
              productName: item.title,
              price: item.price,
              quantity: 1,
              unit: item.unit || "unit",
              rawUnit: item.rawUnit ?? item.unit ?? null,
              unitPrice: item.pricePerUnit
                ? Number(String(item.pricePerUnit).replace(/[^0-9.]/g, ""))
                : null,
              imageUrl: item.image_url || null,
              productId: item.id,
              productMappingId: null,
              location: item.location || null,
              zipCode: storeZip || null,
              groceryStoreId,
            }
          })

          if (payloads.length === 0) {
            console.log("[grocery-search] No new items to cache (all from cache)")
            return
          }

          console.log("[grocery-search] Batch upserting cache entries", {
            count: payloads.length,
            stores: payloads.map((payload) => payload.store),
          })

          const count = await ingredientsHistoryDB.batchInsertPrices(payloads)

          if (count === 0) {
            console.error("[grocery-search] Batch cache upsert FAILED", { payloadCount: payloads.length })
          } else {
            console.log("[grocery-search] Batch cache upsert SUCCESS", {
              count,
              stores: payloads.map((payload) => payload.store),
            })
          }
        })
        .catch((error) =>
          console.error("[grocery-search] Failed to cache direct scraper results", {
            error: error.message,
            stack: error.stack,
          })
        )

      return {
        status: 200,
        body: {
          results: limitResultsPerStore(formatDirectItems(directItems, { useItemLocationFallback: false })),
          cached: false,
          source: "scraper-direct",
        },
      }
    }

    return {
      status: 200,
      body: {
        results: [],
        cached: false,
        source: "unavailable",
        message: "No prices available right now. Please try again.",
      },
    }
  }

  const formatted = formatCacheResults(cachedRows, sanitizedSearchTerm, zipToUse)
  const totalTime = Date.now() - requestStart

  console.log("[grocery-search] Request completed", {
    searchTerm: sanitizedSearchTerm,
    resultsCount: formatted.length,
    storesReturned: [...new Set(formatted.map((row) => String(row.provider)))],
    totalTimeMs: totalTime,
  })

  return {
    status: 200,
    body: {
      results: limitResultsPerStore(formatted),
      cached: true,
      source: "supabase-cache",
      standardizedIngredientId,
    },
  }
}
