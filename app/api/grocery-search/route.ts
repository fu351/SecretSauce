import { type NextRequest, NextResponse } from "next/server"
import {
  getOrRefreshIngredientPricesForStores,
  resolveOrCreateStandardizedId,
  resolveStandardizedIngredientForRecipe,
  searchOrCreateIngredientAndPrices,
  type IngredientCacheResult,
} from "@/lib/ingredient-pipeline"
import { createServerClient } from "@/lib/database/supabase"

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

async function scrapeDirectFallback(
  term: string,
  stores: string[],
  zip?: string,
  standardizedIngredientId?: string | null,
  supabaseClient?: ReturnType<typeof createServerClient> | null,
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

    if (standardizedIngredientId && supabaseClient) {
      // Single batched query for all stores
      let query = supabaseClient
        .from("ingredients_recent")
        .select("*")
        .eq("standardized_ingredient_id", standardizedIngredientId)
        .in("store", stores.map(s => s.toLowerCase()))

      if (zip) {
        query = query.eq("zip_code", zip)
      }

      const { data: cachedItems } = await query.order("created_at", { ascending: false })

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
          results.push({
            id: cached.product_id || cached.id,
            title: cached.product_name || term,
            price: Number(cached.price) || 0,
            unit: cached.unit || null,
            pricePerUnit: cached.unit_price ? `$${cached.unit_price}/${cached.unit}` : null,
            image_url: cached.image_url || null,
            provider: store,
            location: cached.location || null,
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
          let data: any[] = []
          if (store === "kroger" || store === "meijer") {
            data = (await scraper(zip, term)) || []
          } else if (store === "target") {
            data = (await scraper(term, null, zip)) || []
          } else {
            data = (await scraper(term, zip)) || []
          }
          if (!Array.isArray(data)) return []
          return data.map((item: any) => ({
            id: item.id || `${store}-${Math.random()}`,
            title: item.title || item.name || term,
            price: Number(item.price) || 0,
            unit: item.unit || null,
            pricePerUnit: item.pricePerUnit || null,
            image_url: item.image_url || null,
            provider: store,
            location: item.location || null,
            fromCache: false,
          }))
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

function normalizeZipInput(value?: string | null): string | undefined {
  if (!value) return undefined
  const match = value.match(/\b\d{5}(?:-\d{4})?\b/)
  if (match) return match[0].slice(0, 5)
  const trimmed = value.trim()
  if (/^\d{5}$/.test(trimmed)) return trimmed
  return undefined
}

async function resolveStandardizedIdForTerm(
  supabaseClient: ReturnType<typeof createServerClient>,
  term: string,
  recipeId?: string | null,
): Promise<string | null> {
  try {
    if (recipeId) {
      return await resolveStandardizedIngredientForRecipe(recipeId, term)
    }

    // Use the shared pipeline resolver so fuzzy/normalized lookups reuse existing cache rows
    return await resolveOrCreateStandardizedId(term)
  } catch (error) {
    console.error("[grocery-search] resolveStandardizedIdForTerm error", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const requestStart = Date.now()
  // Debug logging version: 2025-11-23-v3
  console.log("[grocery-search] API endpoint hit", { timestamp: new Date().toISOString() })

  const { searchParams } = new URL(request.url)
  const rawSearchTerm = searchParams.get("searchTerm") || ""
  const sanitizedSearchTerm = (rawSearchTerm.split(",")[0] || "").trim() || rawSearchTerm.trim()
  const zipParam = searchParams.get("zipCode") || ""
  let zipToUse = normalizeZipInput(zipParam)
  const recipeId = searchParams.get("recipeId")
  const rawStoreParam = (searchParams.get("store") || "").trim()
  const storeKey = resolveStoreKey(rawStoreParam)
  const storeKeys = storeKey ? [storeKey] : DEFAULT_STORE_KEYS
  const forceRefresh = searchParams.get("forceRefresh") === "true"

  const supabaseClient = createServerClient()

  // Prefer current user's profile postal_code if logged in
  if (!zipToUse) {
    try {
      const { data: authUserRes } = await supabaseClient.auth.getUser()
      const userId = authUserRes?.user?.id
      if (userId) {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("postal_code")
          .eq("id", userId)
          .maybeSingle()
        zipToUse = normalizeZipInput(profile?.postal_code)
      }
    } catch (error) {
      console.warn("[grocery-search] Failed to derive zip from current user profile", error)
    }
  }

  if (!zipToUse) {
    zipToUse = "47906"
  }

  if (!sanitizedSearchTerm) {
    return NextResponse.json({ error: "Search term is required" }, { status: 400 })
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
  })

  // If forceRefresh is true, skip cache and go directly to scrapers
  if (forceRefresh) {
    console.log("[grocery-search] Force refresh requested, bypassing cache and scraping directly")

    const directItems = await scrapeDirectFallback(sanitizedSearchTerm, storeKeys, zipToUse, null, null)

    if (directItems.length > 0) {
      // Resolve standardized ID for caching
      if (recipeId) {
        standardizedIngredientId = await resolveStandardizedIngredientForRecipe(
          recipeId,
          sanitizedSearchTerm,
        )
      }
      if (!standardizedIngredientId) {
        standardizedIngredientId = await resolveStandardizedIdForTerm(supabaseClient, sanitizedSearchTerm, recipeId)
      }

      // Fire-and-forget batch cache write
      if (standardizedIngredientId) {
        Promise.resolve()
          .then(async () => {
            const payloads = directItems.map(item => ({
              standardized_ingredient_id: standardizedIngredientId,
              store: item.provider.toLowerCase(),
              product_name: item.title,
              price: item.price,
              quantity: 1,
              unit: item.unit || "unit",
              unit_price: item.pricePerUnit
                ? Number(String(item.pricePerUnit).replace(/[^0-9.]/g, ""))
                : null,
              image_url: item.image_url || null,
              product_id: item.id,
              location: item.location || null,
              zip_code: zipToUse || null,
            }))

            await supabaseClient
              .from("ingredients_history")
              .insert(payloads)

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
      standardizedIngredientId = await resolveStandardizedIngredientForRecipe(
        recipeId,
        sanitizedSearchTerm,
      )
      console.log("[grocery-search] Resolved standardized ingredient", { standardizedIngredientId })
    }

    if (standardizedIngredientId) {
      // OPTIMIZED: Single batched call for all stores instead of one per store
      console.log("[grocery-search] Fetching cache/scrape for all stores (batched)", {
        stores: storeKeys,
        standardizedIngredientId,
        zipToUse
      })

      cachedRows = await getOrRefreshIngredientPricesForStores(
        standardizedIngredientId,
        storeKeys,
        {
          zipCode: zipToUse,
          allowRealTimeScraping: false // Only return cached results - daily scraper pre-populates cache
        }
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
      console.log("[grocery-search] No standardized ID yet, running searchOrCreate workflow", {
        searchTerm: sanitizedSearchTerm,
        stores: storeKeys,
        zipCode: zipToUse,
      })
      cachedRows = await searchOrCreateIngredientAndPrices(sanitizedSearchTerm, storeKeys, {
        zipCode: zipToUse,
        allowRealTimeScraping: false // Only return cached results - daily scraper pre-populates cache
      })

      console.log("[grocery-search] searchOrCreate workflow completed", {
        searchTerm: sanitizedSearchTerm,
        resultsCount: cachedRows.length,
        storesWithResults: cachedRows.map(r => r.store),
        storesWithoutResults: storeKeys.filter(s => !cachedRows.some(r => r.store.toLowerCase() === s.toLowerCase()))
      })

      if (cachedRows.length > 0) {
        standardizedIngredientId = cachedRows[0].standardized_ingredient_id
      }
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

    const directItems = await scrapeDirectFallback(
      sanitizedSearchTerm,
      storeKeys,
      zipToUse,
      standardizedIngredientId,
      supabaseClient
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
          const payloads = directItems
            .filter(item => !item.fromCache) // Only cache scraped items, not already-cached ones
            .map(item => ({
              standardized_ingredient_id: standardizedId,
              store: item.provider.toLowerCase(),
              product_name: item.title,
              price: item.price,
              quantity: 1,
              unit: item.unit || "unit",
              unit_price: item.pricePerUnit
                ? Number(String(item.pricePerUnit).replace(/[^0-9.]/g, ""))
                : null,
              image_url: item.image_url || null,
              product_id: item.id,
              location: item.location || null,
              zip_code: zipToUse || null,
            }))

          if (payloads.length === 0) {
            console.log("[grocery-search] No new items to cache (all from cache)")
            return
          }

          console.log("[grocery-search] Batch upserting cache entries", {
            count: payloads.length,
            stores: payloads.map(p => p.store),
          })

          // Batch upsert all cache entries at once
          const { data, error } = await supabaseClient
            .from("ingredients_history")
            .insert(payloads)
            .select("id, store")

          if (error) {
            console.error("[grocery-search] Batch cache upsert FAILED", {
              error: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            })
          } else {
            console.log("[grocery-search] Batch cache upsert SUCCESS", {
              count: data?.length || 0,
              stores: data?.map(d => d.store) || [],
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
