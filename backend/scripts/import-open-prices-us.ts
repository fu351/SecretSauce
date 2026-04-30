#!/usr/bin/env tsx
/**
 * Import US Open Food Facts Open Prices rows into the grocery pricing tables.
 *
 * Dry run by default:
 *   pnpm import:open-prices-us
 *
 * Write mode:
 *   pnpm import:open-prices-us -- --write
 *
 * Useful limits while testing:
 *   pnpm import:open-prices-us -- --write --max-locations=2 --max-prices=50
 */

import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { GroceryStoreEnum } from "@/lib/store/open-prices-store-map"
import * as openPricesStoreMap from "../../lib/store/open-prices-store-map.js"

const storeMapModule = ((openPricesStoreMap as any).default ?? openPricesStoreMap) as typeof openPricesStoreMap
const { STORE_DISPLAY_NAMES, resolveOpenPricesLocationStore } = storeMapModule

dotenv.config({ path: ".env.local" })
dotenv.config()

const OPEN_PRICES_BASE_URL = "https://prices.openfoodfacts.org"
const USER_AGENT =
  process.env.OPEN_PRICES_USER_AGENT?.trim() ||
  "SecretSauce/0.1 (https://github.com/afu75/SecretSauce; contact: dev@example.com)"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})

type OpenPricesLocation = {
  id: number
  type: string
  osm_id: number | null
  osm_type: string | null
  osm_name: string | null
  osm_display_name: string | null
  osm_brand: string | null
  osm_address_postcode: string | null
  osm_address_city: string | null
  osm_address_country: string | null
  osm_address_country_code: string | null
  osm_lat: number | null
  osm_lon: number | null
  price_count: number
  product_count: number
  proof_count: number
  updated: string | null
}

type OpenPricesProduct = {
  id: number
  code: string | null
  source: string | null
  product_name: string | null
  image_url: string | null
  product_quantity: number | null
  product_quantity_unit: string | null
  categories_tags?: string[] | null
  brands?: string | null
}

type OpenPricesPrice = {
  id: number
  product_id: number | null
  location_id: number | null
  proof_id: number | null
  product: OpenPricesProduct | null
  location: OpenPricesLocation | null
  type: "PRODUCT" | "CATEGORY"
  product_code: string | null
  product_name: string | null
  price: number | null
  currency: string | null
  date: string | null
  duplicate_of: number | null
  price_is_discounted: boolean
  price_without_discount: number | null
  discount_type: string | null
  created: string | null
  updated: string | null
}

type Page<T> = {
  items: T[]
  page: number
  pages: number
  size: number
  total: number
}

type Args = {
  write: boolean
  importPrices: boolean
  maxLocations: number | null
  maxPrices: number | null
  pageSize: number
  since: string | null
  store: GroceryStoreEnum | null
}

type ImportLocation = {
  location: OpenPricesLocation
  storeEnum: GroceryStoreEnum
}

type StoreImportSummary = {
  locations: number
  pricesSeen: number
  pricesImported: number
  pricesSkipped: number
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  newhampshire: "NH",
  newjersey: "NJ",
  newmexico: "NM",
  newyork: "NY",
  northcarolina: "NC",
  northdakota: "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  rhodeisland: "RI",
  southcarolina: "SC",
  southdakota: "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  westvirginia: "WV",
  wisconsin: "WI",
  wyoming: "WY",
  districtofcolumbia: "DC",
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    write: false,
    importPrices: true,
    maxLocations: null,
    maxPrices: null,
    pageSize: 100,
    since: null,
    store: null,
  }

  for (const arg of argv) {
    if (arg === "--write") args.write = true
    else if (arg === "--locations-only") args.importPrices = false
    else if (arg.startsWith("--max-locations=")) args.maxLocations = parsePositiveInt(arg, "--max-locations")
    else if (arg.startsWith("--max-prices=")) args.maxPrices = parsePositiveInt(arg, "--max-prices")
    else if (arg.startsWith("--page-size=")) args.pageSize = parsePositiveInt(arg, "--page-size") ?? args.pageSize
    else if (arg.startsWith("--since=")) args.since = arg.split("=", 2)[1] || null
    else if (arg.startsWith("--store=")) args.store = arg.split("=", 2)[1] as GroceryStoreEnum
    else if (arg === "--help") {
      printHelp()
      process.exit(0)
    }
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

function parsePositiveInt(arg: string, name: string): number | null {
  const value = Number(arg.split("=", 2)[1])
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

function printHelp() {
  console.log(`Usage: pnpm import:open-prices-us -- [options]

Options:
  --write              Write to Supabase. Default is dry run.
  --locations-only     Import/check locations without importing price rows.
  --max-locations=N    Limit locations for testing.
  --max-prices=N       Limit total price rows fetched/imported for testing.
  --page-size=N        Open Prices page size. Default: 100.
  --since=YYYY-MM-DD   Only import prices on or after this date.
  --store=ENUM         Only import locations mapped to one parent store enum.
`)
}

async function openPricesGet<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  const response = await fetch(`${OPEN_PRICES_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Open Prices ${response.status} for ${path}: ${body.slice(0, 300)}`)
  }

  return response.json() as Promise<T>
}

async function fetchAllUsLocations(pageSize: number, maxMappedLocations?: number | null): Promise<ImportLocation[]> {
  const locations: ImportLocation[] = []
  let page = 1

  while (true) {
    const params = new URLSearchParams({
      osm_address_country__like: "United States",
      price_count__gte: "1",
      order_by: "-price_count",
      size: String(pageSize),
      page: String(page),
    })
    const body = await openPricesGet<Page<OpenPricesLocation>>(`/api/v1/locations?${params}`)

    for (const location of body.items || []) {
      if (location.osm_address_country_code && location.osm_address_country_code !== "US") continue
      const storeEnum = resolveOpenPricesLocationStore(location)
      if (!storeEnum) continue
      locations.push({ location, storeEnum })
      if (maxMappedLocations && locations.length >= maxMappedLocations) return locations
    }

    if (page >= body.pages || !body.items?.length) break
    page += 1
  }

  return locations
}

async function upsertLocation(entry: ImportLocation, write: boolean): Promise<string | null> {
  const { location, storeEnum } = entry
  if (!write) return null

  const { data: bySource, error: sourceError } = await supabase
    .from("grocery_stores")
    .select("id")
    .eq("metadata->open_prices->>location_id", String(location.id))
    .limit(1)
    .maybeSingle()

  if (sourceError) {
    console.warn("[open-prices] location source lookup failed", sourceError.message)
  }

  const existingId = bySource?.id ?? await findSimilarLocationId(location, storeEnum)
  const payload = buildLocationPayload(location, storeEnum)

  if (existingId) {
    const { error } = await supabase
      .from("grocery_stores")
      .update(payload as any)
      .eq("id", existingId)

    if (error) throw new Error(`Failed to update grocery_stores ${existingId}: ${error.message}`)
    return existingId
  }

  const { data, error } = await supabase
    .from("grocery_stores")
    .insert(payload as any)
    .select("id")
    .single()

  if (error) throw new Error(`Failed to insert grocery_stores location ${location.id}: ${error.message}`)
  return data.id
}

async function findSimilarLocationId(
  location: OpenPricesLocation,
  storeEnum: GroceryStoreEnum
): Promise<string | null> {
  const zip = normalizeZip(location.osm_address_postcode)
  if (!zip) return null

  const { data, error } = await supabase
    .from("grocery_stores")
    .select("id")
    .eq("store_enum", storeEnum)
    .eq("zip_code", zip)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn("[open-prices] location fallback lookup failed", error.message)
    return null
  }

  return data?.id ?? null
}

function buildLocationPayload(location: OpenPricesLocation, storeEnum: GroceryStoreEnum) {
  const state = parseStateCode(location.osm_display_name)
  const metadata = {
    open_prices: {
      location_id: location.id,
      osm_id: location.osm_id,
      osm_type: location.osm_type,
      osm_brand: location.osm_brand,
      osm_name: location.osm_name,
      price_count: location.price_count,
      product_count: location.product_count,
      proof_count: location.proof_count,
      updated: location.updated,
    },
  }

  return {
    name: STORE_DISPLAY_NAMES[storeEnum] || location.osm_brand || location.osm_name || "Open Prices Store",
    store_enum: storeEnum,
    address: location.osm_display_name,
    city: location.osm_address_city,
    state,
    zip_code: normalizeZip(location.osm_address_postcode),
    is_active: true,
    geom: buildPoint(location.osm_lon, location.osm_lat),
    metadata,
  }
}

function normalizeZip(value: string | null | undefined): string | null {
  const match = value?.match(/\b\d{5}\b/)
  return match?.[0] ?? null
}

function parseStateCode(displayName: string | null | undefined): string | null {
  if (!displayName) return null
  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean)
  for (const part of parts) {
    const key = part.toLowerCase().replace(/[^a-z]/g, "")
    if (STATE_NAME_TO_CODE[key]) return STATE_NAME_TO_CODE[key]
  }
  return null
}

function buildPoint(lon: number | null, lat: number | null): string | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return `POINT(${lon} ${lat})`
}

async function importLocationPrices(
  entry: ImportLocation,
  groceryStoreId: string | null,
  args: Args,
  pricesFetchedBeforeLocation: number
): Promise<Pick<StoreImportSummary, "pricesSeen" | "pricesImported" | "pricesSkipped">> {
  let page = 1
  let pricesSeen = 0
  let pricesImported = 0
  let pricesSkipped = 0

  while (true) {
    const remainingPriceBudget = args.maxPrices
      ? Math.max(0, args.maxPrices - pricesFetchedBeforeLocation - pricesSeen)
      : args.pageSize
    if (remainingPriceBudget <= 0) break

    const params = new URLSearchParams({
      location_id: String(entry.location.id),
      currency: "USD",
      type: "PRODUCT",
      duplicate_of__isnull: "true",
      order_by: "-date",
      size: String(Math.min(args.pageSize, remainingPriceBudget)),
      page: String(page),
    })

    if (args.since) params.set("date__gte", args.since)

    const body = await openPricesGet<Page<OpenPricesPrice>>(`/api/v1/prices?${params}`)
    const prices = body.items || []
    if (!prices.length) break

    pricesSeen += prices.length
    const importable = prices.filter(isImportablePrice)
    pricesSkipped += prices.length - importable.length

    if (args.write && groceryStoreId && importable.length) {
      const existingIds = await fetchExistingOpenPriceIds(importable.map((price) => String(price.id)))
      const freshPrices = importable.filter((price) => !existingIds.has(String(price.id)))
      pricesSkipped += importable.length - freshPrices.length
      pricesImported += await insertPriceBatch(freshPrices, entry, groceryStoreId)
    } else if (!args.write) {
      pricesImported += importable.length
    }

    if (page >= body.pages || prices.length === 0) break
    page += 1
  }

  return { pricesSeen, pricesImported, pricesSkipped }
}

function isImportablePrice(price: OpenPricesPrice): boolean {
  const product = price.product
  return Boolean(
    price.type === "PRODUCT" &&
      price.currency === "USD" &&
      price.duplicate_of == null &&
      Number(price.price) > 0 &&
      (product?.code || price.product_code) &&
      (product?.product_name || price.product_name)
  )
}

async function fetchExistingOpenPriceIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()

  const { data, error } = await supabase
    .from("ingredients_history")
    .select("source_price_id")
    .eq("source", "open_prices")
    .in("source_price_id", ids)

  if (error) {
    throw new Error(
      `Unable to read Open Prices provenance columns. Run the Open Prices migration first. ${error.message}`
    )
  }

  return new Set((data || []).map((row) => row.source_price_id).filter(Boolean) as string[])
}

async function insertPriceBatch(
  prices: OpenPricesPrice[],
  entry: ImportLocation,
  groceryStoreId: string
): Promise<number> {
  if (!prices.length) return 0

  const payload = prices.map((price) => {
    const product = price.product
    return {
      store: entry.storeEnum,
      price: Number(price.price),
      imageUrl: product?.image_url ?? null,
      productName: product?.product_name ?? price.product_name ?? null,
      productId: `off:${product?.code ?? price.product_code}`,
      rawUnit: formatRawUnit(product),
      unit: normalizeProductUnit(product?.product_quantity_unit),
      zipCode: normalizeZip(entry.location.osm_address_postcode),
      store_id: groceryStoreId,
    }
  })

  const { data, error } = await supabase.rpc("fn_bulk_insert_ingredient_history", {
    p_items: payload,
  } as any)

  if (error) throw new Error(`fn_bulk_insert_ingredient_history failed: ${error.message}`)

  const results = Array.isArray(data) ? data : []
  const pendingByName = new Map<string, OpenPricesPrice[]>()
  for (const price of prices) {
    const name = price.product?.product_name ?? price.product_name
    if (!name) continue
    const key = name.trim().toLowerCase()
    const list = pendingByName.get(key) ?? []
    list.push(price)
    pendingByName.set(key, list)
  }

  let updated = 0
  for (const result of results) {
    if (!result?.inserted_id || result.status === "error") continue

    const productName = String(result.product_name ?? "").trim().toLowerCase()
    const candidates = pendingByName.get(productName)
    const source = candidates?.shift()
    if (!source) continue

    await updateHistoryProvenance(result.inserted_id, source)
    updated += 1
  }

  return updated
}

function formatRawUnit(product: OpenPricesProduct | null): string | null {
  if (!product?.product_quantity || !product.product_quantity_unit) return null
  return `${product.product_quantity} ${product.product_quantity_unit}`
}

function normalizeProductUnit(unit: string | null | undefined): string | null {
  if (!unit) return null
  const normalized = unit.toLowerCase().trim()
  if (normalized === "g") return "g"
  if (normalized === "kg") return "kg"
  if (normalized === "mg") return "mg"
  if (normalized === "ml") return "ml"
  if (normalized === "l") return "l"
  if (normalized === "oz") return "oz"
  if (normalized === "fl oz" || normalized === "floz") return "fl oz"
  if (normalized === "lb" || normalized === "lbs") return "lb"
  return null
}

async function updateHistoryProvenance(historyId: string, price: OpenPricesPrice) {
  const { error } = await supabase
    .from("ingredients_history")
    .update({
      source: "open_prices",
      source_price_id: String(price.id),
      source_location_id: price.location_id,
      source_price_date: price.date,
      source_currency: price.currency,
      source_proof_id: price.proof_id,
      source_payload: {
        price_id: price.id,
        product_id: price.product_id,
        product_code: price.product?.code ?? price.product_code,
        price_is_discounted: price.price_is_discounted,
        price_without_discount: price.price_without_discount,
        discount_type: price.discount_type,
        created: price.created,
        updated: price.updated,
      },
    } as any)
    .eq("id", historyId)

  if (error) throw new Error(`Failed to update Open Prices provenance for ${historyId}: ${error.message}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const locations = await fetchAllUsLocations(args.pageSize, args.maxLocations)
  const filtered = locations
    .filter((entry) => !args.store || entry.storeEnum === args.store)
    .slice(0, args.maxLocations ?? undefined)

  const summary = new Map<GroceryStoreEnum, StoreImportSummary>()
  const unknownCount = locations.length - filtered.length
  let totalPricesFetched = 0

  console.log(
    `[open-prices] ${args.write ? "WRITE" : "DRY RUN"}: ${filtered.length} mapped US locations` +
      (args.maxLocations ? ` (limited to ${args.maxLocations})` : "")
  )

  for (const entry of filtered) {
    const current = summary.get(entry.storeEnum) ?? {
      locations: 0,
      pricesSeen: 0,
      pricesImported: 0,
      pricesSkipped: 0,
    }
    current.locations += 1
    summary.set(entry.storeEnum, current)

    const groceryStoreId = await upsertLocation(entry, args.write)

    if (args.importPrices) {
      const priceSummary = await importLocationPrices(entry, groceryStoreId, args, totalPricesFetched)
      totalPricesFetched += priceSummary.pricesSeen
      current.pricesSeen += priceSummary.pricesSeen
      current.pricesImported += priceSummary.pricesImported
      current.pricesSkipped += priceSummary.pricesSkipped
    }

    console.log(
      `[open-prices] ${entry.storeEnum} location=${entry.location.id} pricesSeen=${current.pricesSeen} imported=${current.pricesImported}`
    )

    if (args.maxPrices && totalPricesFetched >= args.maxPrices) break
  }

  console.table(
    Array.from(summary.entries()).map(([store, row]) => ({
      store,
      locations: row.locations,
      pricesSeen: row.pricesSeen,
      pricesImported: row.pricesImported,
      pricesSkipped: row.pricesSkipped,
    }))
  )

  if (unknownCount > 0 && args.store) {
    console.log(`[open-prices] Store filter excluded ${unknownCount} mapped locations.`)
  }

  if (!args.write) {
    console.log("[open-prices] Dry run complete. Re-run with --write to insert/update Supabase.")
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[open-prices] Import failed:", error)
    process.exit(1)
  })
