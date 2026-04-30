import type { Database } from "@/lib/database/supabase"

export type GroceryStoreEnum = Database["public"]["Enums"]["grocery_store"]

export const SUPPORTED_GROCERY_STORE_ENUMS = [
  "aldi",
  "kroger",
  "safeway",
  "meijer",
  "target",
  "traderjoes",
  "99ranch",
  "walmart",
  "andronicos",
  "wholefoods",
  "albertsons",
  "costco",
  "groceryoutlet",
  "sprouts",
  "smartandfinal",
  "raleys",
  "savemart",
  "shoprite",
  "publix",
  "winco",
  "heb",
  "weismarkets",
  "aholddelhaize",
  "hmart",
  "marketbasket",
  "bjs",
  "samsclub",
  "dollartree",
  "keyfood",
  "eataly",
  "ikea",
  "cvs",
  "independent",
] as const satisfies readonly GroceryStoreEnum[]

export const GROCERY_STORE_ENUM_SET = new Set<GroceryStoreEnum>(SUPPORTED_GROCERY_STORE_ENUMS)

export const STORE_DISPLAY_NAMES: Record<GroceryStoreEnum, string> = {
  aldi: "Aldi",
  kroger: "Kroger",
  safeway: "Safeway",
  meijer: "Meijer",
  target: "Target",
  traderjoes: "Trader Joe's",
  "99ranch": "99 Ranch",
  walmart: "Walmart",
  andronicos: "Andronico's Community Markets",
  wholefoods: "Whole Foods",
  albertsons: "Albertsons",
  costco: "Costco",
  groceryoutlet: "Grocery Outlet",
  sprouts: "Sprouts",
  smartandfinal: "Smart & Final",
  raleys: "Raley's",
  savemart: "Save Mart",
  shoprite: "ShopRite",
  publix: "Publix",
  winco: "WinCo Foods",
  heb: "H-E-B",
  weismarkets: "Weis Markets",
  aholddelhaize: "Ahold Delhaize",
  hmart: "H Mart",
  marketbasket: "Market Basket",
  bjs: "BJ's Wholesale Club",
  samsclub: "Sam's Club",
  dollartree: "Dollar Tree",
  keyfood: "Key Food",
  eataly: "Eataly",
  ikea: "IKEA",
  cvs: "CVS",
  independent: "Independent Grocer",
}

const KROGER_SUBSIDIARIES = [
  "kroger",
  "foodsco",
  "foods co",
  "food 4 less",
  "fredmeyer",
  "fred meyer",
  "qfc",
  "dillons",
  "frys",
  "fry s",
  "fry's",
  "citymarket",
  "city market",
  "harris teeter",
  "king soopers",
  "ralphs",
  "smiths",
  "smith's",
  "marianos",
  "mariano's",
  "pick n save",
  "metro market",
]

const ALBERTSONS_BANNERS = [
  "albertsons",
  "safeway",
  "vons",
  "jewel osco",
  "jewel-osco",
  "acme",
  "shaws",
  "shaw's",
  "star market",
  "randalls",
  "tom thumb",
  "pavilions",
  "carrs",
]

const AHOLD_DELHAIZE_BANNERS = [
  "giant food",
  "giant",
  "food lion",
  "stop and shop",
  "stop & shop",
  "hannaford",
]

const INDEPENDENT_GROCERY_TERMS = [
  "market",
  "grocery",
  "grocer",
  "produce",
  "deli",
  "foods",
  "food",
  "supermarket",
  "international",
]

const NON_GROCERY_TERMS = [
  "hardware",
  "pharmacy",
  "petco",
  "autozone",
  "lowe",
  "marshalls",
  "vitamin shoppe",
  "new balance",
  "school",
  "fire station",
]

export function normalizeStoreName(value: string): string {
  return normalizeStoreText(value).replace(/\s+/g, "")
}

function normalizeStoreText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function includesAny(normalized: string, terms: readonly string[]): boolean {
  return terms.some((term) => normalized.includes(normalizeStoreText(term)))
}

export function resolveParentGroceryStoreEnum(
  value: string | GroceryStoreEnum | null | undefined
): GroceryStoreEnum | null {
  if (!value) return null

  const normalized = normalizeStoreText(value)
  const compact = normalized.replace(/\s+/g, "")
  if (GROCERY_STORE_ENUM_SET.has(compact as GroceryStoreEnum)) {
    return compact as GroceryStoreEnum
  }

  if (includesAny(normalized, KROGER_SUBSIDIARIES)) return "kroger"
  if (includesAny(normalized, ALBERTSONS_BANNERS)) return "albertsons"
  if (includesAny(normalized, AHOLD_DELHAIZE_BANNERS)) return "aholddelhaize"

  if (normalized.includes("target")) return "target"
  if (normalized.includes("meijer")) return "meijer"
  if (normalized.includes("99") || normalized.includes("ranch")) return "99ranch"
  if (normalized.includes("walmart")) return "walmart"
  if (normalized.includes("trader joe")) return "traderjoes"
  if (normalized.includes("aldi")) return "aldi"
  if (normalized.includes("andronico")) return "andronicos"
  if (normalized.includes("whole foods")) return "wholefoods"
  if (normalized.includes("costco")) return "costco"
  if (normalized.includes("grocery outlet")) return "groceryoutlet"
  if (normalized.includes("sprouts")) return "sprouts"
  if (normalized.includes("smart and final")) return "smartandfinal"
  if (normalized.includes("nob hill") || normalized.includes("raley")) return "raleys"
  if (normalized.includes("lucky") || normalized.includes("foodmaxx") || normalized.includes("save mart")) return "savemart"
  if (normalized.includes("shoprite")) return "shoprite"
  if (normalized.includes("publix")) return "publix"
  if (normalized.includes("winco")) return "winco"
  if (normalized.includes("h e b") || normalized.includes("heb")) return "heb"
  if (normalized.includes("weis")) return "weismarkets"
  if (normalized.includes("h mart")) return "hmart"
  if (normalized.includes("market basket")) return "marketbasket"
  if (normalized.includes("bj s") || normalized.includes("bjs wholesale")) return "bjs"
  if (normalized.includes("sam s club") || normalized.includes("sams club")) return "samsclub"
  if (normalized.includes("dollar tree")) return "dollartree"
  if (normalized.includes("key food")) return "keyfood"
  if (normalized.includes("eataly")) return "eataly"
  if (normalized.includes("ikea")) return "ikea"
  if (normalized.includes("cvs")) return "cvs"

  if (includesAny(normalized, NON_GROCERY_TERMS)) return null
  if (includesAny(normalized, INDEPENDENT_GROCERY_TERMS)) return "independent"

  return null
}

export function resolveOpenPricesLocationStore(location: {
  osm_brand?: string | null
  osm_name?: string | null
}): GroceryStoreEnum | null {
  return resolveParentGroceryStoreEnum(location.osm_brand) ?? resolveParentGroceryStoreEnum(location.osm_name)
}
