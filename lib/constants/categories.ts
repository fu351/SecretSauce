/**
 * Shared food category constants and utilities
 * Used across shopping list and pantry pages
 */

export const FOOD_CATEGORIES = [
  "Produce",
  "Dairy",
  "Meat & Seafood",
  "Pantry Staples",
  "Frozen",
  "Beverages",
  "Snacks",
  "Condiments",
  "Baking",
] as const

export const DEFAULT_CATEGORY = "Other"

export type FoodCategory = typeof FOOD_CATEGORIES[number] | typeof DEFAULT_CATEGORY

/**
 * Normalize category value - handles null/empty strings and converts
 * database lowercase to UI Title Case
 */
export function normalizeCategory(value?: string | null): FoodCategory {
  if (!value || value.trim().length === 0) return DEFAULT_CATEGORY

  const val = value.trim().toLowerCase()
  
  // Find the match in your FOOD_CATEGORIES array regardless of casing
  const match = FOOD_CATEGORIES.find(
    cat => cat.toLowerCase() === val
  )

  return match || DEFAULT_CATEGORY
}

/**
 * Get emoji icon for category
 */
export function getCategoryIcon(category: string): string {
  // Ensure we are checking against the exact strings in FOOD_CATEGORIES
  const normalized = normalizeCategory(category)
  
  switch (normalized) {
    case "Produce": return "🥬"
    case "Dairy": return "🥛"
    case "Meat & Seafood": return "🥩"
    case "Pantry Staples": return "🥫"
    case "Frozen": return "❄️"
    case "Beverages": return "🥤"
    case "Snacks": return "🍪"
    case "Condiments": return "🧂"
    case "Baking": return "🍞"
    default: return "📦"
  }
}