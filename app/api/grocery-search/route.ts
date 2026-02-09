import { type NextRequest, NextResponse } from "next/server"
import {
  getOrRefreshIngredientPricesForStores,
  type IngredientCacheResult,
} from "@/lib/ingredient-pipeline"
import { createServerClient } from "@/lib/database/supabase"
import { normalizeZipCode } from "@/lib/utils/zip"
import { normalizeStoreName, ingredientsRecentDB, ingredientsHistoryDB } from "@/lib/database/ingredients-db"
import { profileDB } from "@/lib/database/profile-db"
import { recipeIngredientsDB } from "@/lib/database/recipe-ingredients-db"
import type { Database } from "@/lib/database/supabase"
import { buildStoreMetadataFromStoreData, type StoreMetadataMap } from "@/lib/utils/store-metadata"
import { getUserPreferredStores, type StoreData } from "@/lib/store/user-preferred-stores"

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

const FALLBACK_ZIP_CODE = normalizeZipCode(process.env.ZIP_CODE ?? process.env.DEFAULT_ZIP_CODE)

type ScraperRuntimeConfig = {
  liveActivation?: boolean
  bypassTimeouts?: boolean
  timeoutMultiplier?: number
  timeoutFloorMs?: number
}

async function withScraperRuntimeContext<T>(
  runtimeConfig: ScraperRuntimeConfig | null,
  fn: () => Promise<T>
): Promise<T> {
  if (!runtimeConfig) return fn()

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { runWithScraperRuntimeConfig } = require("@/lib/scrapers/runtime-config")
  return runWithScraperRuntimeConfig(runtimeConfig, fn)
}

function extractSupabaseAccessToken(request: NextRequest): string | null {
  const headerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    ?.trim()

  if (headerToken) {
    return headerToken
  }

  return (
    request.cookies.get("sb-access-token")?.value ??
    request.cookies.get("supabase-access-token")?.value ??
    request.cookies.get("supabase-auth-token")?.value ??
    null
  )
}

// getUserPreferredStores and StoreData type moved to @/lib/store/user-preferred-stores


async function scrapeDirectFallback(
  term: string,
  stores: string[],
  zip?: string,
  standardizedIngredientId?: string | null,
  preferredStoresMap?: Map<string, StoreData>,
): Promise<
  Array<{
    id: string
    title: string
    price: number
    unit?: string | null
    pricePerUnit?: string | null
    image_url?: string | null
    provider: string
    location?: string | null
    fromCache?: boolean
  }>
> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const scrapers = require("@/lib/scrapers")
    const scraperMap: Record<string, any> = {
      walmart: scrapers.searchWalmartAPI,
      target: scrapers.getTargetProducts,
      kroger: scrapers.Krogers,
      meijer: scrapers.Meijers,
      "99ranch": scrapers.search99Ranch,
      ranch99: scrapers.search99Ranch,
      traderjoes: scrapers.searchTraderJoes,
      aldi: scrapers.searchAldi,
      andronicos: scrapers.searchAndronicos,
      wholefoods: scrapers.searchWholeFoods,
      safeway: scrapers.searchSafeway,
    }

    const results: any[] = []

    // Check cache for all stores at once if we have a standardized ID
    const storesToScrape: string[] = []
    const cachedStores: string[] = []

    if (standardizedIngredientId) {
      const cachedItems = await ingredientsRecentDB.findByStandardizedId(
        standardizedIngredientId,
        stores,
        zip
      )

      // Build a map of cached stores
      const cachedByStore = new Map<string, any>()
      if (cachedItems) {
        cachedItems.forEach(cached => {
          const key = cached.store?.toLowerCase?.() || cached.store
          if (key && !cachedByStore.has(key)) {
            cachedByStore.set(key, cached)
          }
        })
      }

      // Process each store - use cache if available, otherwise mark for scraping
      for (const store of stores) {
        const cached = cachedByStore.get(store.toLowerCase())
        if (cached) {
          // Get store coordinates from preferredStoresMap if available
          const metadataKey = normalizeStoreName(store)
          const storeData = preferredStoresMap?.get(metadataKey)

          results.push({
            id: cached.product_id || cached.id,
            title: cached.product_name || term,
            price: Number(cached.price) || 0,
            unit: cached.unit || null,
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
      // No standardized ID, scrape all stores
      storesToScrape.push(...stores)
    }

    // Scrape stores in parallel for better performance
    const scrapePromises = storesToScrape
      .filter(store => scraperMap[store])
      .map(async (store) => {
        const scraper = scraperMap[store]
        try {
          // Get store-specific data from database if available
          const metadataKey = normalizeStoreName(store)
          const storeData = preferredStoresMap?.get(metadataKey)
          const storeZip = storeData?.zip_code || zip

          // Format store location from database
          const storeLocation = storeData && storeData.address && storeData.city && storeData.state && storeData.zip_code
            ? `${storeData.address}, ${storeData.city}, ${storeData.state} ${storeData.zip_code}`
            : null

          console.log(`[scrapeDirectFallback] Scraping ${store} with ${storeData ? 'database' : 'fallback'} zip: ${storeZip}`)

          let data: any[] = []
          if (store === "kroger" || store === "meijer") {
            data = (await scraper(storeZip, term)) || []
          } else if (store === "target") {
            // Pass null for storeMetadata — Target's scraper expects its own store IDs
            // (numeric, from redsky), not our internal grocery_store_id UUIDs.
            // It will resolve the correct store via getNearestStore(zipCode) itself.
            data = (await scraper(term, null, storeZip)) || []
          } else {
            data = (await scraper(term, storeZip)) || []
          }
          if (!Array.isArray(data)) return []
          const mapped = data.map((item: any) => ({
            id: item.id || `${store}-${Math.random()}`,
            title: item.title || item.name || term,
            price: Number(item.price) || 0,
            unit: item.unit || null,
            pricePerUnit: item.pricePerUnit || null,
            image_url: item.image_url || null,
            provider: store,
            location: storeLocation || item.location || null,
            latitude: storeData?.latitude,
            longitude: storeData?.longitude,
            fromCache: false,
          }))
          console.log("[scrapeDirectFallback] Results", { store, count: mapped.length })
          return mapped;
        } catch (error) {
          console.warn("[grocery-search] Fallback scraper error", { store, error })
          return []
        }
      })

    const scrapeResults = await Promise.all(scrapePromises)
    scrapeResults.forEach(storeResults => results.push(...storeResults))

    return results
  } catch (error) {
    console.error("[grocery-search] Failed fallback scraping", error)
    return []
  }
}

async function resolveStandardizedIdForTerm(
  supabaseClient: ReturnType<typeof createServerClient>,
  term: string,
  recipeId?: string | null,
): Promise<string | null> {
  try {
    if (recipeId) {
      return await findRecipeStandardizedIngredientId(recipeId, term)
    }

    // Use the shared pipeline resolver so fuzzy/normalized lookups reuse existing cache rows
    console.log("[grocery-search] No recipeId provided; skipping standardized ID resolution on server")
    return null
  } catch (error) {
    console.error("[grocery-search] resolveStandardizedIdForTerm error", error)
    return null
  }
}

async function findRecipeStandardizedIngredientId(recipeId: string, rawName: string): Promise<string | null> {
  if (!recipeId) return null
  const trimmed = rawName?.trim()
  if (!trimmed) return null

  const entry = await recipeIngredientsDB.findByRecipeIdAndDisplayName(recipeId, trimmed)
  return entry?.standardized_ingredient_id ?? null
}

export async function GET(request: NextRequest) {
  const requestStart = Date.now()
  // Debug logging version: 2025-11-23-v3
  console.log("[grocery-search] API endpoint hit", { timestamp: new Date().toISOString() })

  const supabaseAccessToken = extractSupabaseAccessToken(request)

  const { searchParams } = new URL(request.url)
  const rawSearchTerm = searchParams.get("searchTerm") || ""
  const sanitizedSearchTerm = (rawSearchTerm.split(",")[0] || "").trim() || rawSearchTerm.trim()
  const zipParam = searchParams.get("zipCode") || ""
  let zipToUse = normalizeZipCode(zipParam)
  const recipeId = searchParams.get("recipeId")
  const rawStoreParam = (searchParams.get("store") || "").trim()
  const storeKey = resolveStoreKey(rawStoreParam)
  const storeKeys = storeKey ? [storeKey] : DEFAULT_STORE_KEYS
  const forceRefresh = searchParams.get("forceRefresh") === "true"
  const liveActivation =
    searchParams.get("liveActivation") === "true" || forceRefresh
  const scraperRuntimeConfig: ScraperRuntimeConfig | null = liveActivation
    ? { liveActivation: true }
    : null

  if (rawStoreParam) {
    console.log(`[grocery-search] Store mapping: "${rawStoreParam}" -> "${storeKey}"`)
  }

  const supabaseClient = createServerClient()

  // Only use profile zip_code as fallback if no zipcode was explicitly provided
  let profileZip: string | null = null
  let userId: string | null = null
  try {
    const { data: authUserRes } = await supabaseClient.auth.getUser(supabaseAccessToken ?? undefined)
    userId = authUserRes?.user?.id || null
    if (userId && !zipToUse) {
      // Only use profile zip if no zipcode was explicitly provided
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

  if (!zipToUse) {
    zipToUse = FALLBACK_ZIP_CODE
  }

  console.log("[grocery-search] Resolved zip code", { zipToUse })

  if (!zipToUse) {
    return NextResponse.json({ error: "Zip code is required" }, { status: 400 })
  }

  if (!sanitizedSearchTerm) {
    return NextResponse.json({ error: "Search term is required" }, { status: 400 })
  }

  const preferredStoresMap = await getUserPreferredStores(
    supabaseClient,
    userId,
    storeKeys,
    zipToUse,
  )
  const preferredStoreMetadata = buildStoreMetadataFromStoreData(preferredStoresMap)
  const cacheLookupOptions = {
    zipCode: zipToUse,
    allowRealTimeScraping: true,
    storeMetadata: preferredStoreMetadata,
  }

  let standardizedIngredientId: string | null = null
  let cachedRows: IngredientCacheResult[] = []

  console.log("[grocery-search] Incoming request", {
    searchTerm: sanitizedSearchTerm,
    zipParam,
    zipToUse,
    recipeId,
    stores: storeKeys,
    forceRefresh,
    liveActivation,
  })

  // If forceRefresh is true, skip cache and go directly to scrapers
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
        storesReturned: [...new Set(directItems.map(i => i.provider))],
      })
    }

    if (directItems.length > 0) {
      // Resolve standardized ID for caching
      if (recipeId) {
        standardizedIngredientId = await findRecipeStandardizedIngredientId(
          recipeId,
          sanitizedSearchTerm
        )
      }
      if (!standardizedIngredientId) {
        standardizedIngredientId = await resolveStandardizedIdForTerm(supabaseClient, sanitizedSearchTerm, recipeId)
      }

      // Fire-and-forget batch cache write
      if (standardizedIngredientId) {
        Promise.resolve()
          .then(async () => {
            // Note: product_mappings are automatically created by fn_resolve_product_mapping trigger
            const payloads = directItems.map(item => {
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
                unitPrice: item.pricePerUnit
                  ? Number(String(item.pricePerUnit).replace(/[^0-9.]/g, ""))
                  : null,
                imageUrl: item.image_url || null,
                productId: item.id,
                productMappingId: null,
                location: item.location || null,
                zipCode: storeZip || null,
                groceryStoreId: groceryStoreId,
              }
            })

            await ingredientsHistoryDB.batchInsertPrices(payloads)

            console.log("[grocery-search] Force refresh cache update complete", { itemCount: directItems.length })
          })
          .catch((error) => console.error("[grocery-search] Force refresh cache write failed", error))
      }

      return NextResponse.json({
        results: directItems.map((item) => ({
          id: item.id,
          title: item.title,
          brand: "",
          price: item.price,
          pricePerUnit: item.pricePerUnit || (item.unit ? `${item.price}/${item.unit}` : undefined),
          unit: item.unit || "",
          image_url: item.image_url || "/placeholder.svg",
          provider: mapStoreKeyToName(item.provider.toLowerCase()),
          location: item.location || `${mapStoreKeyToName(item.provider.toLowerCase())} Grocery`,
          category: "Grocery",
        })),
        cached: false,
        source: "scraper-force-refresh",
      })
    }

    return NextResponse.json({
      results: [],
      cached: false,
      source: "unavailable",
      message: "No prices available right now. Please try again.",
    })
  }

  try {
    if (recipeId) {
      standardizedIngredientId = await findRecipeStandardizedIngredientId(
        recipeId,
        sanitizedSearchTerm
      )
      console.log("[grocery-search] Resolved standardized ingredient", { standardizedIngredientId })
    }

    if (standardizedIngredientId) {
      const standardizedIdForLookup = standardizedIngredientId
      // OPTIMIZED: Single batched call for all stores instead of one per store
      console.log("[grocery-search] Fetching cache/scrape for all stores (batched)", {
        stores: storeKeys,
        standardizedIngredientId: standardizedIdForLookup,
        zipToUse
      })

      cachedRows = await withScraperRuntimeContext(scraperRuntimeConfig, () =>
        getOrRefreshIngredientPricesForStores(
          standardizedIdForLookup,
          storeKeys,
          cacheLookupOptions,
        )
      )

      const cacheHitStores = cachedRows.map(r => r.store)
      const cacheMissStores = storeKeys.filter(s => !cachedRows.some(r => r.store.toLowerCase() === s.toLowerCase()))

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
          message: "These stores are missing from cache - daily scraper should have populated them"
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

    // Ensure we have a standardized ID so the fallback can reuse cache rows before scraping
    if (!standardizedIngredientId) {
      standardizedIngredientId = await resolveStandardizedIdForTerm(supabaseClient, sanitizedSearchTerm, recipeId)
    }

    // Use the preferred store metadata we already fetched
    const directItems = await withScraperRuntimeContext(scraperRuntimeConfig, () =>
      scrapeDirectFallback(
        sanitizedSearchTerm,
        storeKeys,
        zipToUse,
        standardizedIngredientId,
        preferredStoresMap
      )
    )
    if (directItems.length > 0) {
      // Fire-and-forget cache write so the user gets results immediately
      Promise.resolve()
        .then(async () => {
          console.log("[grocery-search] Starting background cache write for direct scraper results", {
            itemCount: directItems.length,
            searchTerm: sanitizedSearchTerm,
          })

          const standardizedId =
            standardizedIngredientId || (await resolveStandardizedIdForTerm(supabaseClient, sanitizedSearchTerm, recipeId))

          if (!standardizedId) {
            console.warn("[grocery-search] Could not resolve standardized ID for caching", { searchTerm: sanitizedSearchTerm })
            return
          }

          console.log("[grocery-search] Resolved standardized ID for caching", { standardizedId, searchTerm: sanitizedSearchTerm })

          // Build all payloads for batch upsert
          // Note: product_mappings are automatically created by fn_resolve_product_mapping trigger
          const freshItems = directItems.filter(item => !item.fromCache)

          const payloads = freshItems.map(item => {
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
              unitPrice: item.pricePerUnit
                ? Number(String(item.pricePerUnit).replace(/[^0-9.]/g, ""))
                : null,
              imageUrl: item.image_url || null,
              productId: item.id,
              productMappingId: null,
              location: item.location || null,
              zipCode: storeZip || null,
              groceryStoreId: groceryStoreId,
            }
          });

          if (payloads.length === 0) {
            console.log("[grocery-search] No new items to cache (all from cache)")
            return
          }

          console.log("[grocery-search] Batch upserting cache entries", {
            count: payloads.length,
            stores: payloads.map(p => p.store),
          })

          const count = await ingredientsHistoryDB.batchInsertPrices(payloads)

          if (count === 0) {
            console.error("[grocery-search] Batch cache upsert FAILED", { payloadCount: payloads.length })
          } else {
            console.log("[grocery-search] Batch cache upsert SUCCESS", {
              count,
              stores: payloads.map(p => p.store),
            })
          }
        })
        .catch((error) => console.error("[grocery-search] Failed to cache direct scraper results", {
          error: error.message,
          stack: error.stack,
        }))

      return NextResponse.json({
        results: directItems.map((item) => ({
          id: item.id,
          title: item.title,
          brand: "",
          price: item.price,
          pricePerUnit: item.pricePerUnit || (item.unit ? `${item.price}/${item.unit}` : undefined),
          unit: item.unit || "",
          image_url: item.image_url || "/placeholder.svg",
          provider: mapStoreKeyToName(item.provider.toLowerCase()),
          location: `${mapStoreKeyToName(item.provider.toLowerCase())} Grocery`,
          category: "Grocery",
        })),
        cached: false,
        source: "scraper-direct",
      })
    }

    return NextResponse.json({
      results: [],
      cached: false,
      source: "unavailable",
      message: "No prices available right now. Please try again.",
    })
  }
  const formatted = formatCacheResults(cachedRows, sanitizedSearchTerm, zipToUse)
  const totalTime = Date.now() - requestStart

  console.log("[grocery-search] Request completed", {
    searchTerm: sanitizedSearchTerm,
    resultsCount: formatted.length,
    storesReturned: [...new Set(formatted.map(r => r.provider))],
    totalTimeMs: totalTime,
  })

  return NextResponse.json({
    results: formatted,
    cached: true,
    source: "supabase-cache",
    standardizedIngredientId,
  })
}

function resolveStoreKey(storeParam: string) {
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

function getStoreLocationLabel(storeName: string, zipCode?: string) {
  if (zipCode) {
    return `${storeName} (${zipCode})`
  }
  return `${storeName} Grocery`
}

function formatCacheResults(
  cachedItems: IngredientCacheResult[],
  fallbackName: string,
  zipCode: string,
): any[] {
  return cachedItems.map((item) => {
    const storeName = mapStoreKeyToName(item.store.toLowerCase().trim())
    const quantityDisplay = `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
    const fallbackTitle = `${fallbackName || item.product_name || "Ingredient"} (${quantityDisplay})`

    // Use cached location (physical address from scraper) if available, otherwise fall back to generic label
    const locationHint = item.location || getStoreLocationLabel(storeName, zipCode)

    return {
      id: item.product_id || item.id,
      title: item.product_name || fallbackTitle,
      brand: "",
      price: Number(item.price) || 0,
      pricePerUnit: item.unit_price ? `$${item.unit_price}/${item.unit}` : undefined,
      unit: item.unit,
      image_url: item.image_url || "/placeholder.svg",
      product_url: (item as any).product_url,
      provider: storeName,
      location: locationHint,
      category: "Grocery",
    }
  })
}
