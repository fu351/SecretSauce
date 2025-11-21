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

function normalizeZipInput(value?: string | null): string | undefined {
  if (!value) return undefined
  const match = value.match(/\b\d{5}(?:-\d{4})?\b/)
  if (match) return match[0].slice(0, 5)
  const trimmed = value.trim()
  if (/^\d{5}$/.test(trimmed)) return trimmed
  return undefined
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

  // If no usable zip supplied, try the recipe author's profile postal_code
  if (!zipToUse && recipeId) {
    try {
      const { data: recipe } = await supabaseClient.from("recipes").select("author_id").eq("id", recipeId).maybeSingle()
      if (recipe?.author_id) {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("postal_code")
          .eq("id", recipe.author_id)
          .maybeSingle()
        zipToUse = normalizeZipInput(profile?.postal_code)
      }
    } catch (error) {
      console.warn("[grocery-search] Failed to derive zip from recipe profile", error)
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

  try {
    if (recipeId) {
      standardizedIngredientId = await resolveStandardizedIngredientForRecipe(
        supabaseClient,
        recipeId,
        sanitizedSearchTerm,
      )
    }

    if (standardizedIngredientId) {
      for (const store of storeKeys) {
        const row = await getOrRefreshIngredientPrice(supabaseClient, standardizedIngredientId, store, {
          zipCode: zipToUse,
        })
        if (row) {
          cachedRows.push(row)
        }
      }
    } else {
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
    return NextResponse.json(
      { results: [], cached: false, source: "unavailable", message: "No prices available right now. Please try again." },
      { status: 404 },
    )
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
  return `${storeName} Store`
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
      location: getStoreLocationLabel(storeName, zipCode),
      category: "Grocery",
    }
  })
}
