import { SupabaseClient } from "@supabase/supabase-js"
import { createServerClient, type Database } from "./supabase"
import { standardizeIngredientsWithAI } from "./ingredient-standardizer"

type DB = Database["public"]["Tables"]
type IngredientCacheRow = DB["ingredient_cache"]["Row"]
type IngredientMappingRow = DB["ingredient_mappings"]["Row"]
type StandardizedIngredientRow = DB["standardized_ingredients"]["Row"]

type SupabaseLike = SupabaseClient<Database>

export type IngredientCacheResult = Omit<IngredientCacheRow, "created_at"> & {
  created_at?: string
}

export interface PricedIngredient {
  standardizedIngredientId: string
  name: string
  cache: IngredientCacheResult | null
}

const MEASUREMENT_TERMS = [
  "cup",
  "cups",
  "tsp",
  "teaspoon",
  "teaspoons",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "pound",
  "pounds",
  "lb",
  "lbs",
  "ounce",
  "ounces",
  "oz",
  "gram",
  "grams",
  "g",
  "kg",
  "kilogram",
  "kilograms",
  "ml",
  "milliliter",
  "milliliters",
  "liter",
  "liters",
  "l",
  "pinch",
  "clove",
  "cloves",
  "slice",
  "slices",
  "stick",
  "sticks",
]

const STOP_WORDS = new Set([
  "fresh",
  "large",
  "small",
  "boneless",
  "skinless",
  "ripe",
  "optional",
  "chopped",
  "sliced",
  "diced",
  "minced",
  "ground",
  "crushed",
  "grated",
  "shredded",
  "cooked",
  "uncooked",
  "raw",
  "whole",
  "dried",
  "toasted",
  "packed",
  "divided",
])

const CACHE_TTL_HOURS = 24

function normalizeIngredientName(raw: string): string {
  const lower = raw.toLowerCase().trim()
  if (!lower) return ""

  const withoutParens = lower.replace(/\(.*?\)/g, " ")
  const withoutFractions = withoutParens.replace(/[\d/.-]+/g, " ")
  const withoutUnits = MEASUREMENT_TERMS.reduce(
    (acc, term) => acc.replace(new RegExp(`\\b${term}\\b`, "g"), " "),
    withoutFractions
  )
  const tokens = withoutUnits
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))

  return tokens.join(" ").trim()
}

async function findStandardizedIngredient(
  client: SupabaseLike,
  normalizedName: string,
  fallbackName?: string
): Promise<StandardizedIngredientRow | null> {
  const searchValue = normalizedName || fallbackName?.toLowerCase().trim() || ""
  if (!searchValue) return null

  const exact = await client
    .from("standardized_ingredients")
    .select("id, canonical_name, category")
    .eq("canonical_name", searchValue)
    .maybeSingle()

  if (exact.data) return exact.data
  if (exact.error && exact.error.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Exact canonical lookup failed", exact.error)
  }

  const fuzzy = await client
    .from("standardized_ingredients")
    .select("id, canonical_name, category")
    .ilike("canonical_name", `%${searchValue}%`)
    .limit(1)
    .maybeSingle()

  if (fuzzy.data) return fuzzy.data
  if (fuzzy.error && fuzzy.error.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Fuzzy canonical lookup failed", fuzzy.error)
  }

  return null
}

async function createStandardizedIngredient(
  client: SupabaseLike,
  canonicalName: string,
  category?: string | null
): Promise<string> {
  const safeName = canonicalName.trim().toLowerCase()
  const { data, error } = await client
    .from("standardized_ingredients")
    .upsert(
      { canonical_name: safeName, category: category ?? null },
      { onConflict: "canonical_name" }
    )
    .select("id")
    .maybeSingle()

  if (error || !data?.id) {
    throw new Error(`Unable to create standardized ingredient: ${error?.message || "unknown error"}`)
  }

  return data.id
}

async function ensureIngredientMapping(
  client: SupabaseLike,
  recipeId: string,
  originalName: string,
  standardizedIngredientId: string
): Promise<void> {
  try {
    const { data: existing, error: existingError } = await client
      .from("ingredient_mappings")
      .select("id")
      .eq("recipe_id", recipeId)
      .eq("original_name", originalName)
      .maybeSingle()

    if (existingError && existingError.code !== "PGRST116") {
      console.warn("[ingredient-pipeline] Failed to check existing mapping", existingError)
    }

    if (!existing?.id) {
      const { error } = await client.from("ingredient_mappings").insert({
        recipe_id: recipeId,
        original_name: originalName,
        standardized_ingredient_id: standardizedIngredientId,
      } satisfies DB["ingredient_mappings"]["Insert"])
      if (error) {
        console.warn("[ingredient-pipeline] Failed to insert mapping", error)
      }
    }
  } catch (error) {
    console.warn("[ingredient-pipeline] ensureIngredientMapping error", error)
  }
}

async function loadCanonicalName(
  client: SupabaseLike,
  standardizedIngredientId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("standardized_ingredients")
    .select("canonical_name")
    .eq("id", standardizedIngredientId)
    .maybeSingle()

  if (error) {
    console.error("[ingredient-pipeline] Failed to load canonical name", error)
    return null
  }

  return data?.canonical_name?.toLowerCase() || null
}

type ScraperResult = {
  title?: string
  product_name?: string
  price: number
  quantity?: number
  unit?: string
  unit_price?: number
  image_url?: string | null
  product_url?: string | null
  product_id?: string | null
}

type StoreLookupOptions = {
  zipCode?: string | null
}

function normalizeZipInput(value?: string | null): string | undefined {
  if (!value) return undefined
  const match = value.match(/\b\d{5}(?:-\d{4})?\b/)
  if (match) return match[0].slice(0, 5)
  const trimmed = value.trim()
  if (/^\d{5}$/.test(trimmed)) return trimmed
  return undefined
}

async function runStoreScraper(
  store: string,
  canonicalName: string,
  options: StoreLookupOptions = {},
): Promise<ScraperResult[]> {
  const normalizedStore = store.toLowerCase()
  const zip = normalizeZipInput(options.zipCode)
  try {
    console.log("[ingredient-pipeline] Running scraper", { store: normalizedStore, canonicalName, zip })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const scrapers = require("./scrapers")

    const scraperMap: Record<string, ((query: string, zip?: string | null) => Promise<ScraperResult[] | any>) | undefined> =
      {
        walmart: scrapers.searchWalmartAPI,
        safeway: scrapers.searchAndronicos,
        andronicos: scrapers.searchAndronicos,
        traderjoes: scrapers.searchTraderJoes,
        wholefoods: scrapers.searchWholeFoods,
        whole_foods: scrapers.searchWholeFoods,
        aldi: scrapers.searchAldi,
        kroger: scrapers.Krogers,
        meijer: scrapers.Meijers,
        target: scrapers.getTargetProducts,
        ranch99: scrapers.search99Ranch,
        "99ranch": scrapers.search99Ranch,
    }

    const scraper = scraperMap[normalizedStore]
    if (!scraper) {
      console.warn(`[ingredient-pipeline] No scraper configured for store ${store}`)
      return []
    }

    // Most scrapers expect (zip, query) or (query, zip); handle known signatures below.
    let results: any
    switch (normalizedStore) {
      case "kroger":
        results = await scraper(zip, canonicalName)
        break
      case "meijer":
        results = await scraper(zip, canonicalName)
        break
      case "target":
        results = await scraper(canonicalName, null, zip)
        break
      case "walmart":
        results = await scraper(canonicalName, zip)
        break
      case "traderjoes":
      case "wholefoods":
      case "whole_foods":
      case "aldi":
      case "safeway":
      case "andronicos":
      case "ranch99":
      case "99ranch":
        results = await scraper(canonicalName, zip)
        break
      default:
        results = await scraper(canonicalName, zip)
        break
    }

    if (!results) {
      console.warn("[ingredient-pipeline] Scraper returned no results", { store: normalizedStore, canonicalName, zip })
      return []
    }
    if (Array.isArray(results)) {
      console.log("[ingredient-pipeline] Scraper results", { store: normalizedStore, count: results.length })
      return results
    }
    if (results?.items && Array.isArray(results.items)) {
      console.log("[ingredient-pipeline] Scraper results (items field)", { store: normalizedStore, count: results.items.length })
      return results.items
    }
    console.warn("[ingredient-pipeline] Scraper results not in expected format", { store: normalizedStore, canonicalName, zip })
    return []
  } catch (error) {
    console.error(`[ingredient-pipeline] Scraper failed for ${store}`, { error, store, canonicalName, zip })
    return []
  }
}

function pickBestScrapedProduct(items: ScraperResult[]): ScraperResult | null {
  if (!items || items.length === 0) return null

  const sorted = [...items].sort((a, b) => {
    const aUnit = Number.isFinite(a.unit_price) ? Number(a.unit_price) : Number.POSITIVE_INFINITY
    const bUnit = Number.isFinite(b.unit_price) ? Number(b.unit_price) : Number.POSITIVE_INFINITY
    if (aUnit !== bUnit) return aUnit - bUnit
    return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY)
  })

  return sorted[0] || null
}

function buildCachePayload(
  standardizedIngredientId: string,
  store: string,
  product: ScraperResult
): DB["ingredient_cache"]["Insert"] {
  const now = new Date()
  const expires = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000)

  return {
    standardized_ingredient_id: standardizedIngredientId,
    store,
    product_name: product.product_name || product.title || null,
    price: Number(product.price) || 0,
    quantity: Number(product.quantity) || 1,
    unit: product.unit || "unit",
    unit_price: product.unit_price ?? null,
    image_url: product.image_url || null,
    product_id: product.product_id || null,
    expires_at: expires.toISOString(),
  }
}

async function upsertCacheEntry(
  client: SupabaseLike,
  payload: DB["ingredient_cache"]["Insert"]
): Promise<IngredientCacheResult | null> {
  // Try onConflict first; fall back to manual update if constraint is missing
  const upsertAttempt = await client
    .from("ingredient_cache")
    .upsert(payload, { onConflict: "standardized_ingredient_id,store,product_id" })
    .select("*")
    .maybeSingle()

  if (upsertAttempt.data) return upsertAttempt.data
  if (upsertAttempt.error && !upsertAttempt.error.message.includes("duplicate key value")) {
    console.warn("[ingredient-pipeline] Upsert with constraint failed, retrying with manual path", upsertAttempt.error)
  }

  const { data: existing } = await client
    .from("ingredient_cache")
    .select("id")
    .eq("standardized_ingredient_id", payload.standardized_ingredient_id)
    .eq("store", payload.store)
    .eq("product_id", payload.product_id)
    .maybeSingle()

  if (existing?.id) {
    const { data, error } = await client
      .from("ingredient_cache")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .maybeSingle()
    if (error) {
      console.error("[ingredient-pipeline] Failed to update cache entry", error)
      return null
    }
    return data
  }

  const { data, error } = await client
    .from("ingredient_cache")
    .insert(payload)
    .select("*")
    .maybeSingle()

  if (error) {
    console.error("[ingredient-pipeline] Failed to insert cache entry", error)
    return null
  }

  return data
}

export async function resolveStandardizedIngredientForRecipe(
  supabaseClient: SupabaseLike = createServerClient(),
  recipeId: string,
  rawIngredientName: string
): Promise<string> {
  if (!recipeId) throw new Error("recipeId is required")
  const trimmed = rawIngredientName?.trim()
  if (!trimmed) throw new Error("rawIngredientName is required")

  const { data: existingMapping, error: mappingError } = await supabaseClient
    .from("ingredient_mappings")
    .select("standardized_ingredient_id")
    .eq("recipe_id", recipeId)
    .eq("original_name", trimmed)
    .maybeSingle()

  if (mappingError && mappingError.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Failed to read ingredient mapping", mappingError)
  }

  if (existingMapping?.standardized_ingredient_id) {
    return existingMapping.standardized_ingredient_id
  }

  const normalized = normalizeIngredientName(trimmed)
  const maybeExisting = await findStandardizedIngredient(supabaseClient, normalized, trimmed)

  let canonicalName = normalized || trimmed
  if (!maybeExisting) {
    try {
      const aiStandardized = await standardizeIngredientsWithAI([{ id: "0", name: trimmed }], "recipe")
      const aiTop = aiStandardized?.[0]
      canonicalName = aiTop?.canonicalName?.trim() || canonicalName
    } catch (error) {
      console.warn("[ingredient-pipeline] AI standardization failed, falling back to heuristic", error)
    }
  }

  const standardizedId =
    maybeExisting?.id ||
    (await findStandardizedIngredient(supabaseClient, canonicalName, trimmed))?.id ||
    (await createStandardizedIngredient(supabaseClient, canonicalName))

  await ensureIngredientMapping(supabaseClient, recipeId, trimmed, standardizedId)
  return standardizedId
}

export async function getOrRefreshIngredientPrice(
  supabaseClient: SupabaseLike = createServerClient(),
  standardizedIngredientId: string,
  store: string,
  options: StoreLookupOptions = {}
): Promise<IngredientCacheResult | null> {
  if (!standardizedIngredientId) throw new Error("standardizedIngredientId is required")
  if (!store) throw new Error("store is required")

  const { data: cached, error: cacheError } = await supabaseClient
    .from("ingredient_cache")
    .select("*")
    .eq("standardized_ingredient_id", standardizedIngredientId)
    .eq("store", store)
    .gt("expires_at", new Date().toISOString())
    .order("unit_price", { ascending: true, nullsLast: true })
    .order("price", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (cacheError && cacheError.code !== "PGRST116") {
    console.warn("[ingredient-pipeline] Cache lookup failed", cacheError)
  }

  if (cached) {
    return cached
  }

  const canonicalName = await loadCanonicalName(supabaseClient, standardizedIngredientId)
  if (!canonicalName) {
    console.warn("[ingredient-pipeline] Missing canonical name for standardized ingredient", { standardizedIngredientId })
    return null
  }

  const scraped = await runStoreScraper(store, canonicalName, options)
  const bestProduct = pickBestScrapedProduct(scraped)
  if (!bestProduct) {
    console.warn("[ingredient-pipeline] Scraper returned no products", { store, canonicalName })
    return null
  }

  const payload = buildCachePayload(standardizedIngredientId, store, bestProduct)
  return upsertCacheEntry(supabaseClient, payload)
}

async function resolveOrCreateStandardizedId(
  supabaseClient: SupabaseLike,
  query: string
): Promise<string> {
  const normalized = normalizeIngredientName(query)
  const existing = await findStandardizedIngredient(supabaseClient, normalized, query)
  if (existing?.id) return existing.id

  let canonicalName = normalized || query
  try {
    const aiStandardized = await standardizeIngredientsWithAI([{ id: "0", name: query }], "recipe")
    const aiTop = aiStandardized?.[0]
    canonicalName = aiTop?.canonicalName?.trim() || canonicalName
  } catch (error) {
    console.warn("[ingredient-pipeline] AI standardization failed for freeform query, falling back", error)
  }

  const aiExisting = await findStandardizedIngredient(supabaseClient, canonicalName, query)
  if (aiExisting?.id) return aiExisting.id

  return createStandardizedIngredient(supabaseClient, canonicalName)
}

export async function searchOrCreateIngredientAndPrices(
  supabaseClient: SupabaseLike = createServerClient(),
  query: string,
  stores: string[],
  options: StoreLookupOptions = {}
): Promise<IngredientCacheResult[]> {
  if (!query) throw new Error("query is required")
  const standardizedId = await resolveOrCreateStandardizedId(supabaseClient, query)
  const results: IngredientCacheResult[] = []

  for (const store of stores) {
    const cacheRow = await getOrRefreshIngredientPrice(supabaseClient, standardizedId, store, options)
    if (cacheRow) {
      results.push(cacheRow)
    }
  }

  return results
}

export interface IngredientInput {
  name: string
  quantity?: number
  unit?: string
  recipeId?: string | null
  standardizedIngredientId?: string | null
}

export interface CostEstimate {
  total: number
  priced: PricedIngredient[]
  missing: IngredientInput[]
}

export async function estimateIngredientCostsForStore(
  supabaseClient: SupabaseLike = createServerClient(),
  items: IngredientInput[],
  store: string,
  options: StoreLookupOptions = {}
): Promise<CostEstimate> {
  const priced: PricedIngredient[] = []
  const missing: IngredientInput[] = []
  let total = 0

  for (const item of items) {
    const displayName = item.name?.trim()
    if (!displayName) {
      missing.push(item)
      continue
    }

    let standardizedId = item.standardizedIngredientId || null
    try {
      if (!standardizedId && item.recipeId) {
        standardizedId = await resolveStandardizedIngredientForRecipe(
          supabaseClient,
          item.recipeId,
          displayName
        )
      }

      if (!standardizedId) {
        standardizedId = await resolveOrCreateStandardizedId(supabaseClient, displayName)
      }
    } catch (error) {
      console.warn("[ingredient-pipeline] Failed to resolve standardized ingredient", {
        item,
        error,
      })
      missing.push(item)
      continue
    }

    const cacheRow = await getOrRefreshIngredientPrice(supabaseClient, standardizedId, store, options)

    if (cacheRow) {
      const quantityMultiplier = Number.isFinite(item.quantity) ? Number(item.quantity) : 1
      total += cacheRow.price * quantityMultiplier
      priced.push({
        standardizedIngredientId: standardizedId,
        name: displayName,
        cache: cacheRow,
      })
    } else {
      missing.push(item)
    }
  }

  return {
    total: Number(total.toFixed(2)),
    priced,
    missing,
  }
}

export async function updateShoppingListEstimate(
  supabaseClient: SupabaseLike = createServerClient(),
  shoppingListId: string,
  store: string,
  options: StoreLookupOptions = {}
): Promise<CostEstimate | null> {
  const { data: shoppingList, error } = await supabaseClient
    .from("shopping_lists")
    .select("items")
    .eq("id", shoppingListId)
    .maybeSingle()

  if (error || !shoppingList) {
    console.error("[ingredient-pipeline] Failed to load shopping list", error)
    return null
  }

  const items: IngredientInput[] = Array.isArray(shoppingList.items)
    ? shoppingList.items.map((item: any) => ({
        name: item.name || item.ingredient || "",
        quantity: item.quantity ?? 1,
        unit: item.unit,
        standardizedIngredientId: item.standardized_ingredient_id ?? null,
        recipeId: item.recipe_id ?? null,
      }))
    : []

  const estimate = await estimateIngredientCostsForStore(supabaseClient, items, store, options)

  const { error: updateError } = await supabaseClient
    .from("shopping_lists")
    .update({ total_estimated_cost: estimate.total })
    .eq("id", shoppingListId)

  if (updateError) {
    console.warn("[ingredient-pipeline] Failed to update shopping list total", updateError)
  }

  return estimate
}

export async function updateMealPlanBudget(
  supabaseClient: SupabaseLike = createServerClient(),
  mealPlanId: string,
  store: string,
  options: StoreLookupOptions = {}
): Promise<CostEstimate | null> {
  const { data: mealPlan, error } = await supabaseClient
    .from("meal_plans")
    .select("shopping_list")
    .eq("id", mealPlanId)
    .maybeSingle()

  if (error || !mealPlan) {
    console.error("[ingredient-pipeline] Failed to load meal plan", error)
    return null
  }

  const items: IngredientInput[] = Array.isArray(mealPlan.shopping_list)
    ? mealPlan.shopping_list.map((item: any) => ({
        name: item.name || item.ingredient || "",
        quantity: item.quantity ?? 1,
        unit: item.unit,
        standardizedIngredientId: item.standardized_ingredient_id ?? null,
        recipeId: item.recipe_id ?? null,
      }))
    : []

  const estimate = await estimateIngredientCostsForStore(supabaseClient, items, store, options)

  const { error: updateError } = await supabaseClient
    .from("meal_plans")
    .update({ total_budget: estimate.total })
    .eq("id", mealPlanId)

  if (updateError) {
    console.warn("[ingredient-pipeline] Failed to update meal plan budget", updateError)
  }

  return estimate
}
