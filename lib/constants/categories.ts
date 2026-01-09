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
 * Normalize category value - handles null/empty strings
 */
export function normalizeCategory(value?: string | null): FoodCategory {
  if (value && value.trim().length > 0) {
    return value as FoodCategory
  }
  return DEFAULT_CATEGORY
}

/**
 * Get emoji icon for category
 */
export function getCategoryIcon(category: string): string {
  switch (category) {
    case "Produce":
      return "🥬"
    case "Dairy":
      return "🥛"
    case "Meat & Seafood":
      return "🥩"
    case "Pantry Staples":
      return "🥫"
    case "Frozen":
      return "❄️"
    case "Beverages":
      return "🥤"
    case "Snacks":
      return "🍪"
    case "Condiments":
      return "🧂"
    case "Baking":
      return "🍞"
    case "Other":
    default:
      return "📦"
  }
}
