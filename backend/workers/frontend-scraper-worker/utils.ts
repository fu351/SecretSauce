import { normalizeZipCode } from "../../../lib/utils/zip"
import { resolveRawUnitWithDailyScraperPriority } from "../scraper-worker/utils/daily-scraper-raw-unit"

export interface GroceryItem {
  id: string
  title: string
  brand: string
  price: number
  pricePerUnit?: string
  unit?: string
  rawUnit?: string
  image_url: string
  provider: string
  location?: string
  category?: string
}

export interface StoreResults {
  store: string
  items: GroceryItem[]
  total: number
}

export interface FrontendScraperSearchParams {
  searchTerm: string
  zipCode?: string
  store?: string
  forceRefresh?: boolean
  standardizedIngredientId?: string | null
}

export const DEFAULT_FRONTEND_SCRAPER_TIMEOUT_MS = 60_000
export const DEFAULT_FRONTEND_SCRAPER_FORCE_REFRESH_TIMEOUT_MS = 180_000

function normalizeTextValue(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function normalizeNonNegativeNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value === "string" && value.trim().length === 0) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.floor(parsed)
}

export function buildFrontendScraperRequestUrl(params: FrontendScraperSearchParams): string {
  const normalizedZip = normalizeZipCode(params.zipCode)
  const storeQuery = params.store ? `&store=${encodeURIComponent(params.store)}` : ""
  const forceRefreshQuery = params.forceRefresh ? "&forceRefresh=true" : ""
  const liveActivationQuery = params.forceRefresh ? "&liveActivation=true" : ""
  const standardizedIngredientIdQuery = params.standardizedIngredientId
    ? `&standardizedIngredientId=${encodeURIComponent(params.standardizedIngredientId)}`
    : ""
  const zipQuery = normalizedZip ? `&zipCode=${normalizedZip}` : ""

  return `/api/grocery-search?searchTerm=${encodeURIComponent(params.searchTerm)}${zipQuery}${storeQuery}${forceRefreshQuery}${liveActivationQuery}${standardizedIngredientIdQuery}`
}

export function resolveFrontendScraperTimeoutMs(forceRefresh?: boolean, timeoutOverrideMs?: number): number {
  const timeoutOverride = parseNonNegativeInt(timeoutOverrideMs)
  if (timeoutOverride && timeoutOverride > 0) {
    return timeoutOverride
  }
  return forceRefresh ? DEFAULT_FRONTEND_SCRAPER_FORCE_REFRESH_TIMEOUT_MS : DEFAULT_FRONTEND_SCRAPER_TIMEOUT_MS
}

export function resolveFrontendScraperMaxResults(maxResultsOverride?: number): number {
  const maxResultsOverrideValue = parseNonNegativeInt(maxResultsOverride)
  if (maxResultsOverrideValue !== null) {
    return maxResultsOverrideValue
  }

  const fromPublicEnv = parseNonNegativeInt(process.env.NEXT_PUBLIC_SCRAPER_MAX_RESULTS || "")
  if (fromPublicEnv !== null) {
    return fromPublicEnv
  }

  const fromServerEnv = parseNonNegativeInt(process.env.SCRAPER_MAX_RESULTS || "")
  if (fromServerEnv !== null) {
    return fromServerEnv
  }

  return 0
}

export function normalizeFrontendScraperItem(item: any): GroceryItem {
  const storeName = normalizeTextValue(item?.provider, normalizeTextValue(item?.location, "Unknown Store"))
  const title = normalizeTextValue(item?.title, normalizeTextValue(item?.name, "Unknown Item"))
  const fallbackId = `${storeName}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

  return {
    id: normalizeTextValue(item?.id, fallbackId || "unknown-item"),
    title,
    brand: normalizeTextValue(item?.brand),
    price: normalizeNonNegativeNumber(item?.price),
    pricePerUnit: normalizeTextValue(item?.pricePerUnit) || undefined,
    unit: normalizeTextValue(item?.unit) || undefined,
    rawUnit: resolveRawUnitWithDailyScraperPriority(item) || undefined,
    image_url: normalizeTextValue(item?.image_url, "/default-image.svg"),
    provider: storeName,
    location: normalizeTextValue(item?.location) || undefined,
    category: normalizeTextValue(item?.category) || undefined,
  }
}

export function sortStoreResultsByTotal(results: StoreResults[]): StoreResults[] {
  return [...results].sort((a, b) => a.total - b.total)
}
