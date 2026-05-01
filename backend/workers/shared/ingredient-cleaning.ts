import { normalizeCanonicalName } from "../../scripts/utils/canonical-matching"
import type { IngredientStandardizerContext } from "../standardizer-worker/ingredient-standardizer"

// Recipe/pantry path: preparation methods and marketing qualifiers to strip
export const PREPARATION_AND_MARKETING_RE =
  /\b(?:chopped|minced|diced|sliced|grated|shredded|crushed|cooked|raw|steamed|boiled|roasted|grilled|fried|large|small|medium|jumbo|fresh|organic|premium|extra|fancy|ripe|unripe|deluxe|gourmet|artisan|homestyle|restaurant-style|grade|cage|free|low|fat|part|skim|blend|style|collection|flavor|flavored|microwavable|ready-to-eat)\b/gi

// Recipe/pantry path: inline optional/usage phrases
export const OPTIONAL_PHRASE_RE = /\b(?:to taste|if needed|as needed|optional|divided|plus more)\b/gi

// Shared: trailing packaging/unit noise (used by recipe path and realtime-standardizer)
export const TRAILING_PACKAGING_RE =
  /\s+\d+(?:\.\d+)?\s*(?:oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|kilogram|kilograms|ml|milliliter|milliliters|l|liter|liters|litre|litres|ltr|qt|quart|quarts|pt|pint|pints|gal|gallon|gallons|fl\s*oz|floz|ct|count|counts|pk|pkg|pack|packs|package|packages|bottle|bottles|bag|bags|box|boxes|can|cans|jar|jars|carton|cartons|tray|trays|case|cases|pouch|pouches|unit|units|each|ea|piece|pieces)\b.*$/i

// Scraper path: strips trailing brand suffixes like "- Good & Gather", "– Organic Valley"
export const BRAND_SUFFIX_RE = /\s+[-–]\s*[a-z0-9][a-z0-9 &']{0,30}$/gi

// Scraper path: strips compact nutrition label segments like "- 14g Protein", "- 32g Fat"
export const COMPACT_NUTRITION_RE = /\s*[-–,]\s*\d+[gGmMkK][gG]?\s+\w+(\s+\w+)?\s*$/gi

// Scraper path: strips trailing pack descriptors like "- 6 pack", ", 6 pack"
export const TRAILING_PACK_DESCRIPTOR_RE = /[\s,\-–]+\d+\s*pack\s*$/gi

// Dynamic regexes built from unit_standardization_map keywords (see unit-keywords.ts).
// trailingSeparatorUnit: strips trailing separator+qty+unit blocks like "- 32oz", "- 14g Protein 32oz"
// fusedMidUnit: strips fused qty+unit mid-string like "Butter 16oz unsalted" → "Butter unsalted"
export interface UnitStripRegexes {
  trailingSeparatorUnit: RegExp
  fusedMidUnit: RegExp
}

// keywords must be sorted longest-first so longer patterns match before short ones consume them.
// fn_get_recipe_parser_unit_keywords returns them in that order already.
export function buildUnitStripRegexes(keywords: string[]): UnitStripRegexes {
  const fallback =
    "fl\\s*oz|oz|lbs?|lb|g|kg|mg|ml|gal|ct|each|ea|pk|pt|qt|cup|tbsp|tsp|dz|dozen|bunch|unit"
  const units = keywords.length
    ? keywords
        .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
        .join("|")
    : fallback
  return {
    trailingSeparatorUnit: new RegExp(
      `(\\s*[-–,]\\s*\\d*\\.?\\d+\\s*(${units})(\\s+\\w+)?)+\\s*$`,
      "gi"
    ),
    fusedMidUnit: new RegExp(`\\s+\\d*\\.?\\d+(${units})\\s+`, "gi"),
  }
}

// Scraper path: strips packing/carrier medium phrases like "in extra virgin olive oil", "in brine"
export const PACKING_MEDIUM_RE =
  /\s+in\s+(?:(?:extra\s+virgin|light|heavy|pure)\s+)?(?:olive\s+oil|vegetable\s+oil|sunflower\s+oil|canola\s+oil|oil|water|brine|syrup|juice|tomato\s+sauce|sauce|vinegar)\b/gi

// Scraper path: strips processing qualifiers that add no ingredient meaning
export const PROCESSING_QUALIFIER_RE =
  /\b(?:cold[\s-]pressed|cold[\s-]brew(?:ed)?|stone[\s-]ground|slow[\s-]roasted|slow[\s-]cooked|flash[\s-]frozen|air[\s-]chilled|high[\s-]pressure[\s-]processed|HPP)\b\s*/gi

// Scraper path: matches product-type suffixes preceded by flavor/ingredient modifiers
// e.g. "Red Bell Pepper, Garlic & Parmesan Cream Cheese Spread 8 Oz"
//   -> group1: "Red Bell Pepper, Garlic & Parmesan"  group2: "cream cheese spread"
export const PRODUCT_TYPE_SUFFIX_RE =
  /^(.+?)\s+(cream\s+cheese\s+spread|cheese\s+spread|string\s+cheese|food\s+tub|baby\s+(?:food|snack|puffs?)|meal\s+kit|cream\s+cheese|cream\s+sauce|pasta\s+sauce|tomato\s+sauce|hot\s+sauce|(?:\w+\s+)?soup|(?:\w+\s+)?stew|(?:\w+\s+)?chili|(?:\w+\s+)?curry|sandwich\s+bread|wheat\s+bread|white\s+bread|sourdough\s+bread|english\s+muffin|greek\s+yogurt|ice\s+cream|granola\s+bar|protein\s+bar|energy\s+bar|spread|tub|dip|hummus|salsa|pesto|aioli|kit|bread|bagel|muffin|croissant|tortilla|wrap|pita|cracker|cereal|granola|oatmeal|yogurt|sorbet|gelato|butter)\b/i

// Moves product-type suffix to the front so the LLM anchors on it rather than the first flavor token.
// "Red Bell Pepper, Garlic & Parmesan Cream Cheese Spread 8 Oz"
//   -> "cream cheese spread Red Bell Pepper, Garlic & Parmesan 8 Oz"
export function hoistProductType(name: string): string {
  const match = PRODUCT_TYPE_SUFFIX_RE.exec(name)
  if (!match) return name
  const [, flavorPrefix, productType] = match
  const remainder = name.slice(match[0].length).trim()
  return `${productType} ${flavorPrefix}${remainder ? " " + remainder : ""}`.replace(/\s{2,}/g, " ").trim()
}

// Recipe/pantry path: strip preparation words, optional phrases, and trailing packaging.
export function cleanRecipeIngredientName(name: string): string {
  return normalizeCanonicalName(name)
    .replace(PREPARATION_AND_MARKETING_RE, " ")
    .replace(OPTIONAL_PHRASE_RE, " ")
    .replace(TRAILING_PACKAGING_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

// Scraper path: hoist product type to front, strip packing medium, processing qualifiers,
// brand suffixes, nutrition labels, pack descriptors, and optionally fused unit tokens.
export function cleanScraperProductName(name: string, unitRegexes?: UnitStripRegexes): string {
  let result = hoistProductType(name)
    .replace(/[®™©]/g, "")
    .replace(PACKING_MEDIUM_RE, "")
    .replace(PROCESSING_QUALIFIER_RE, "")
    .replace(BRAND_SUFFIX_RE, "")
    .replace(TRAILING_PACKAGING_RE, "")
  if (unitRegexes) result = result.replace(unitRegexes.trailingSeparatorUnit, "")
  result = result.replace(COMPACT_NUTRITION_RE, "")
  if (unitRegexes) result = result.replace(unitRegexes.fusedMidUnit, " ")
  result = result.replace(TRAILING_PACK_DESCRIPTOR_RE, "")
  result = result.replace(/[\s,–-]+$/g, "")
  return result.replace(/\s{2,}/g, " ").trim()
}

// Dispatcher: routes to the correct cleaner based on standardizer context.
export function cleanIngredientByContext(
  name: string,
  context: IngredientStandardizerContext,
  unitRegexes?: UnitStripRegexes
): string {
  if (context === "recipe" || context === "pantry") return cleanRecipeIngredientName(name)
  return cleanScraperProductName(name, unitRegexes)
}
