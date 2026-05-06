import { normalizeStoreName, resolveParentGroceryStoreEnum } from "@/lib/store/open-prices-store-map"

type PriceSourceCandidate = {
  priceSource?: string | null
  provider?: string | null
  location?: string | null
}

type StoreCandidate = {
  store?: string | null
  providerAliases?: string[] | null
  items?: PriceSourceCandidate[] | null
}

const INSTACART_PRICE_SOURCE_TERMS = ["instacart", "storefront pro", "marketplace"]

const INSTACART_BACKED_STORE_KEYS = new Set([
  "aholddelhaize",
  "aldi",
  "albertsons",
  "andronicos",
  "bjs",
  "costco",
  "heb",
  "publix",
  "raleys",
  "safeway",
  "samsclub",
  "savemart",
  "shoprite",
  "smartandfinal",
  "sprouts",
])

const INSTACART_BACKED_STORE_ALIASES = [
  "bj's",
  "bjs",
  "costco",
  "food lion",
  "h-e-b",
  "heb",
  "lucky",
  "publix",
  "raley",
  "safeway",
  "sam's club",
  "sams club",
  "shoprite",
  "smart & final",
  "smart and final",
  "sprouts",
  "stop & shop",
  "stop and shop",
  "wegmans",
  "winn-dixie",
  "winn dixie",
]

export const INSTACART_PRICE_DISCLAIMER =
  "Prices marked with * come from Instacart-powered listings and may not match in-store pricing."
export const INSTACART_PRICE_FOOTNOTE =
  "These prices come from Instacart-powered listings and may not match in-store pricing."

function hasInstacartPriceSource(value: unknown): boolean {
  if (typeof value !== "string") return false
  const normalized = value.toLowerCase()
  return INSTACART_PRICE_SOURCE_TERMS.some((term) => normalized.includes(term))
}

export function isInstacartBackedStore(value: string | null | undefined): boolean {
  if (!value) return false

  const parentStore = resolveParentGroceryStoreEnum(value)
  if (parentStore && INSTACART_BACKED_STORE_KEYS.has(parentStore)) {
    return true
  }

  const normalized = normalizeStoreName(value)
  return INSTACART_BACKED_STORE_ALIASES.some((alias) => normalized.includes(normalizeStoreName(alias)))
}

export function shouldShowInstacartPriceDisclaimer(candidate: StoreCandidate | null | undefined): boolean {
  if (!candidate) return false

  if (isInstacartBackedStore(candidate.store)) return true

  if (candidate.providerAliases?.some(isInstacartBackedStore)) return true

  return Boolean(
    candidate.items?.some((item) =>
      hasInstacartPriceSource(item.priceSource) ||
      isInstacartBackedStore(item.provider) ||
      isInstacartBackedStore(item.location)
    )
  )
}
