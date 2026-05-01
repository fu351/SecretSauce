import { normalizeCanonicalName } from "../../scripts/utils/canonical-matching"

export const NON_FOOD_TITLE_TOKENS = new Set([
  "balm",
  "body",
  "candle",
  "conditioner",
  "cosmetic",
  "deodorant",
  "dog",
  "face",
  "fragrance",
  "lotion",
  "lip",
  "makeup",
  "mask",
  "perfume",
  "pet",
  "shampoo",
  "skincare",
  "soap",
  "scented",
  "toothpaste",
  "toy",
  "treat",
  "treats",
  "cat",
  "litter",
])

export const NON_FOOD_TITLE_PHRASES: string[][] = [
  ["body", "butter"],
  ["body", "oil"],
  ["body", "wash"],
  ["face", "mask"],
  ["lip", "balm"],
  ["lip", "mask"],
  ["lip", "oil"],
  ["lip", "gloss"],
  ["pet", "treats"],
  ["dog", "treats"],
  ["cat", "treats"],
  ["dog", "food"],
  ["cat", "food"],
  ["tooth", "paste"],
]

export function hasNonFoodTitleSignals(sourceName: string): boolean {
  const normalized = normalizeCanonicalName(sourceName)
  if (!normalized) return false

  const tokens = normalized.split(" ").filter(Boolean)
  if (!tokens.length) return false

  const tokenSet = new Set(tokens)
  if (tokens.some((token) => NON_FOOD_TITLE_TOKENS.has(token))) {
    return true
  }

  return NON_FOOD_TITLE_PHRASES.some((phrase) => phrase.every((token) => tokenSet.has(token)))
}
