import { normalizeCanonicalName } from "../../scripts/utils/canonical-matching"
import type { IngredientStandardizerContext } from "../standardizer-worker/ingredient-standardizer"

// Recipe/pantry path: preparation methods and marketing qualifiers to strip
export const PREPARATION_AND_MARKETING_RE =
  /\b(?:chopped|minced|diced|sliced|grated|shredded|crushed|cooked|raw|steamed|boiled|roasted|grilled|fried|large|small|medium|jumbo|fresh|organic|premium|extra|fancy|ripe|unripe|deluxe|gourmet|artisan|homestyle|restaurant-style|grade|cage|free|low|fat|part|skim|blend|style|collection|flavor|flavored|microwavable|ready-to-eat)\b/gi

// Recipe/pantry path: inline optional/usage phrases
export const OPTIONAL_PHRASE_RE = /\b(?:to taste|if needed|as needed|optional|divided)\b/gi

// Shared: trailing packaging/unit noise (used by recipe path and realtime-standardizer)
export const TRAILING_PACKAGING_RE =
  /\s+\d+(?:\.\d+)?\s*(?:oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|kilogram|kilograms|ml|milliliter|milliliters|l|liter|liters|litre|litres|ltr|qt|quart|quarts|pt|pint|pints|gal|gallon|gallons|fl\s*oz|floz|ct|count|counts|pk|pkg|pack|packs|package|packages|bottle|bottles|bag|bags|box|boxes|can|cans|jar|jars|carton|cartons|tray|trays|case|cases|pouch|pouches|unit|units|each|ea|piece|pieces)\b.*$/i

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
  /^(.+?)\s+(cream\s+cheese\s+spread|cheese\s+spread|food\s+tub|baby\s+(?:food|snack)|meal\s+kit|cream\s+cheese|cream\s+sauce|pasta\s+sauce|tomato\s+sauce|hot\s+sauce|(?:\w+\s+)?soup|(?:\w+\s+)?stew|(?:\w+\s+)?chili|(?:\w+\s+)?curry|sandwich\s+bread|wheat\s+bread|white\s+bread|sourdough\s+bread|english\s+muffin|greek\s+yogurt|ice\s+cream|granola\s+bar|protein\s+bar|energy\s+bar|spread|tub|dip|hummus|salsa|pesto|aioli|kit|bread|bagel|muffin|croissant|tortilla|wrap|pita|cracker|cereal|granola|oatmeal|yogurt|sorbet|gelato|butter)\b/i

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

// Scraper path: hoist product type to front, strip packing medium and processing qualifiers.
export function cleanScraperProductName(name: string): string {
  return hoistProductType(name)
    .replace(PACKING_MEDIUM_RE, "")
    .replace(PROCESSING_QUALIFIER_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

// Dispatcher: routes to the correct cleaner based on standardizer context.
export function cleanIngredientByContext(
  name: string,
  context: IngredientStandardizerContext
): string {
  if (context === "recipe" || context === "pantry") return cleanRecipeIngredientName(name)
  return cleanScraperProductName(name)
}
