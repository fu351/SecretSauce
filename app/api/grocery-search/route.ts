import { type NextRequest, NextResponse } from "next/server"
import {
  getOrRefreshIngredientPrice,
  resolveStandardizedIngredientForRecipe,
  searchOrCreateIngredientAndPrices,
  type IngredientCacheResult,
} from "@/lib/ingredient-pipeline"
import { createServerClient } from "@/lib/supabase"

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
]

async function scrapeDirectFallback(
  term: string,
  stores: string[],
  zip?: string,
): Promise<
  Array<{
    id: string
    title: string
    price: number
    unit?: string | null
    pricePerUnit?: string | null
    image_url?: string | null
    provider: string
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
    }

    const results: any[] = []
    for (const store of stores) {
      const scraper = scraperMap[store]
      if (!scraper) continue
      try {
        let data: any[] = []
        if (store === "kroger" || store === "meijer") {
          data = (await scraper(zip, term)) || []
        } else if (store === "target") {
          data = (await scraper(term, null, zip)) || []
        } else {
          data = (await scraper(term, zip)) || []
        }
        if (!Array.isArray(data)) continue
        data
          .map((item: any) => ({
            id: item.id || `${store}-${Math.random()}`,
            title: item.title || item.name || term,
            price: Number(item.price) || 0,
            unit: item.unit || null,
            pricePerUnit: item.pricePerUnit || null,
            image_url: item.image_url || null,
            provider: store,
          }))
          .forEach((item: any) => results.push(item))
      } catch (error) {
        console.warn("[grocery-search] Fallback scraper error", { store, error })
      }
    }
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

function normalizeCanonicalName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

async function resolveStandardizedIdForTerm(
  supabaseClient: ReturnType<typeof createServerClient>,
  term: string,
  recipeId?: string | null,
): Promise<string | null> {
  try {
    if (recipeId) {
      return await resolveStandardizedIngredientForRecipe(supabaseClient, recipeId, term)
    }

    const canonical = normalizeCanonicalName(term)
    const { data: existing } = await supabaseClient
      .from("standardized_ingredients")
      .select("id")
      .eq("canonical_name", canonical)
      .maybeSingle()

    if (existing?.id) return existing.id

    const { data: inserted, error } = await supabaseClient
      .from("standardized_ingredients")
      .insert({ canonical_name: canonical })
      .select("id")
      .maybeSingle()
    if (error) {
      console.warn("[grocery-search] Failed to insert standardized ingredient", error)
      return null
    }
    return inserted?.id || null
  } catch (error) {
    console.error("[grocery-search] resolveStandardizedIdForTerm error", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawSearchTerm = searchParams.get("searchTerm") || ""
  const sanitizedSearchTerm = (rawSearchTerm.split(",")[0] || "").trim() || rawSearchTerm.trim()
  const zipParam = searchParams.get("zipCode") || ""
  let zipToUse = normalizeZipInput(zipParam)
  const recipeId = searchParams.get("recipeId")
  const rawStoreParam = (searchParams.get("store") || "").trim()
  const storeKey = resolveStoreKey(rawStoreParam)
  const storeKeys = storeKey ? [storeKey] : DEFAULT_STORE_KEYS

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
  })
  try {
    if (recipeId) {
      standardizedIngredientId = await resolveStandardizedIngredientForRecipe(
        supabaseClient,
        recipeId,
        sanitizedSearchTerm,
      )
      console.log("[grocery-search] Resolved standardized ingredient", { standardizedIngredientId })
    }

    if (standardizedIngredientId) {
      for (const store of storeKeys) {
        console.log("[grocery-search] Fetching cache/scrape per store", { store, standardizedIngredientId, zipToUse })
        const row = await getOrRefreshIngredientPrice(supabaseClient, standardizedIngredientId, store, {
          zipCode: zipToUse,
        })
        if (row) {
          cachedRows.push(row)
        }
        console.log("[grocery-search] Store result", { store, found: !!row })
      }
    } else {
      console.log("[grocery-search] No standardized ID yet, running searchOrCreate workflow", {
        searchTerm: sanitizedSearchTerm,
      })
      cachedRows = await searchOrCreateIngredientAndPrices(supabaseClient, sanitizedSearchTerm, storeKeys, {
        zipCode: zipToUse,
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

    const directItems = await scrapeDirectFallback(sanitizedSearchTerm, storeKeys, zipToUse)
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

          const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          let successCount = 0
          let failCount = 0

          for (const item of directItems) {
            // Store with lowercase key for consistent cache lookups
            const storeKey = item.provider.toLowerCase()
            const payload = {
              standardized_ingredient_id: standardizedId,
              store: storeKey,
              product_name: item.title,
              price: item.price,
              quantity: 1,
              unit: item.unit || "unit",
              unit_price: item.pricePerUnit
                ? Number(String(item.pricePerUnit).replace(/[^0-9.]/g, ""))
                : null,
              image_url: item.image_url || null,
              product_id: item.id,
              expires_at: expires,
            }

            console.log("[grocery-search] Upserting cache entry", {
              store: payload.store,
              product_id: payload.product_id,
              product_name: payload.product_name,
              price: payload.price,
            })

            const { data, error } = await supabaseClient
              .from("ingredient_cache")
              .upsert(payload, { onConflict: "standardized_ingredient_id,store,product_id" })
              .select("id")
              .maybeSingle()

            if (error) {
              console.error("[grocery-search] Cache upsert FAILED", {
                store: payload.store,
                product_id: payload.product_id,
                error: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
              })
              failCount++
            } else {
              console.log("[grocery-search] Cache upsert SUCCESS", {
                id: data?.id,
                store: payload.store,
              })
              successCount++
            }
          }

          console.log("[grocery-search] Background cache write complete", {
            successCount,
            failCount,
            total: directItems.length,
          })
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
  if (value.includes("safeway") || value.includes("andronico")) return "andronicos"
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
    andronicos: "Safeway / Andronicos",
    wholefoods: "Whole Foods",
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
