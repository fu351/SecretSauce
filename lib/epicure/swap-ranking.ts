import { toToken } from "./token-utils"
import type { SwapRankOptions, SwapSuggestion } from "./types"

/**
 * Filter, dedupe, sort, and cap raw swap suggestions for presentation.
 *
 * Pure function — no I/O. The source ingredient is always removed, as are any
 * excluded tokens (allergens, pantry items the user already owns, etc.).
 */
export function rankSwaps(
  raw: SwapSuggestion[],
  sourceIngredient: string,
  options: SwapRankOptions = {}
): SwapSuggestion[] {
  const sourceToken = toToken(sourceIngredient)
  const excluded = new Set((options.excludeTokens ?? []).map(toToken))

  const best = new Map<string, SwapSuggestion>()
  for (const suggestion of raw) {
    const token = suggestion.token || toToken(suggestion.ingredient)
    if (token === sourceToken) continue
    if (excluded.has(token)) continue
    if (options.minScore !== undefined && suggestion.score < options.minScore) continue

    const existing = best.get(token)
    if (!existing || suggestion.score > existing.score) {
      best.set(token, suggestion)
    }
  }

  const ranked = Array.from(best.values()).sort((a, b) => b.score - a.score)
  return options.limit !== undefined ? ranked.slice(0, options.limit) : ranked
}
