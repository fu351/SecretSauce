import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/database/supabase-server"
import type { Database } from "@/lib/database/supabase"
import { normalizeZipCode } from "@/lib/utils/zip"

type GroceryStore = Database["public"]["Enums"]["grocery_store"]

type StorePricing = {
  store: string
  total: number
  items: Array<{
    ingredient: string
    price: number
    quantity: number
    unit: string
  }>
}

const SUPPORTED_STORES: GroceryStore[] = [
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

const STORE_ALIASES: Record<string, GroceryStore> = {
  ranch99: "99ranch",
  whole_foods: "wholefoods",
}

const FALLBACK_RECIPE_PRICING_ZIP = normalizeZipCode(
  process.env.ZIP_CODE ?? process.env.DEFAULT_ZIP_CODE
)

function normalizeStoreKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[']/g, "").trim()
}

function resolveStores(storeCsv: string | null): GroceryStore[] {
  if (!storeCsv) return SUPPORTED_STORES

  const requested = storeCsv
    .split(",")
    .map((s) => normalizeStoreKey(s))
    .map((s) => STORE_ALIASES[s] ?? (s as GroceryStore))
    .filter((s): s is GroceryStore => SUPPORTED_STORES.includes(s as GroceryStore))

  return requested.length > 0 ? Array.from(new Set(requested)) : SUPPORTED_STORES
}

function mapIngredientBreakdown(ingredients: Record<string, number> | null | undefined): StorePricing["items"] {
  if (!ingredients) return []
  return Object.entries(ingredients).map(([ingredient, price]) => ({
    ingredient,
    price: Number(price) || 0,
    quantity: 1,
    unit: "unit",
  }))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const recipeId = searchParams.get("recipeId")

    if (!recipeId) {
      return NextResponse.json({ error: "recipeId parameter is required" }, { status: 400 })
    }

    const requestedZip = normalizeZipCode(searchParams.get("zipCode") || "")
    const zipCode = requestedZip ?? FALLBACK_RECIPE_PRICING_ZIP
    if (!zipCode) {
      return NextResponse.json(
        { error: "zipCode parameter is required when no fallback ZIP is configured" },
        { status: 400 }
      )
    }

    const servingsRaw = Number.parseInt(searchParams.get("servings") || "", 10)
    const servings = Number.isFinite(servingsRaw) && servingsRaw > 0 ? servingsRaw : 2
    const stores = resolveStores(searchParams.get("stores"))

    const supabase = createServerClient()

    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("title")
      .eq("id", recipeId)
      .is("deleted_at", null)
      .maybeSingle()

    if (recipeError || !recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 })
    }

    const { data: recipeIngredients, error: ingredientsError } = await supabase
      .from("recipe_ingredients")
      .select("display_name, standardized_ingredient_id")
      .eq("recipe_id", recipeId)
      .is("deleted_at", null)

    if (ingredientsError) {
      return NextResponse.json({ error: "Failed to fetch recipe ingredients" }, { status: 500 })
    }

    const standardizedIds = Array.from(
      new Set(
        (recipeIngredients || [])
          .map((row) => row.standardized_ingredient_id)
          .filter((id): id is string => Boolean(id))
      )
    )

    let cachedIngredients = 0
    if (standardizedIds.length > 0) {
      const { data: recentRows, error: recentError } = await supabase
        .from("ingredients_recent")
        .select("standardized_ingredient_id")
        .in("standardized_ingredient_id", standardizedIds)
        .in("store", stores)
        .eq("zip_code", zipCode)

      if (!recentError && recentRows) {
        cachedIngredients = new Set(recentRows.map((row) => row.standardized_ingredient_id)).size
      }
    }

    const storePricingResults = await Promise.all(
      stores.map(async (store) => {
        const { data, error } = await (supabase.rpc as any)("calculate_recipe_cost", {
          p_recipe_id: recipeId,
          p_store_id: store,
          p_zip_code: zipCode,
          p_servings: servings,
        })

        if (error || !data || typeof data.totalCost !== "number" || data.totalCost <= 0) {
          return null
        }

        const items = mapIngredientBreakdown(data.ingredients)

        return {
          store,
          total: Number(data.totalCost.toFixed(2)),
          items,
        } as StorePricing
      })
    )

    const byStore = storePricingResults
      .filter((item): item is StorePricing => item !== null)
      .sort((a, b) => a.total - b.total)

    const totalIngredients = recipeIngredients?.length || 0
    const pricingInfo = {
      recipeName: recipe.title,
      cheapest: byStore[0] || null,
      byStore,
      allStores: byStore.map((s) => s.store),
      totalIngredients,
      cachedIngredients,
      isComplete: (byStore[0]?.items.length || 0) >= totalIngredients && totalIngredients > 0,
    }

    return NextResponse.json(pricingInfo)
  } catch (error) {
    console.error("Error fetching recipe pricing:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch recipe pricing",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
