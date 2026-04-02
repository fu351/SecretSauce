import type { CanonicalDoubleCheckDailyStatsRow } from "../../../lib/database/ingredient-match-queue-db"

export interface SurvivorSelection {
  survivorCanonical: string
  loserCanonical: string
}

/**
 * Determines which canonical survives a merge:
 * - lateral: higher product count wins (weighted heuristic — the more-used
 *   canonical is the "centre of mass" in the product-count-weighted projection
 *   space and should be kept). Falls back to shorter name, then lexicographic.
 * - specific_to_generic: target is the generic, so target survives.
 */
export function selectSurvivor(
  row: CanonicalDoubleCheckDailyStatsRow,
  productCounts?: Map<string, number>
): SurvivorSelection {
  if (row.direction === "specific_to_generic") {
    return { survivorCanonical: row.target_canonical, loserCanonical: row.source_canonical }
  }

  // lateral: prefer the canonical with more product mappings
  if (productCounts) {
    const sourceCount = productCounts.get(row.source_canonical) ?? 0
    const targetCount = productCounts.get(row.target_canonical) ?? 0
    if (sourceCount !== targetCount) {
      return sourceCount > targetCount
        ? { survivorCanonical: row.source_canonical, loserCanonical: row.target_canonical }
        : { survivorCanonical: row.target_canonical, loserCanonical: row.source_canonical }
    }
  }

  // fall back: prefer shorter name, then lexicographic
  const sourceWins =
    row.source_canonical.length < row.target_canonical.length ||
    (row.source_canonical.length === row.target_canonical.length &&
      row.source_canonical <= row.target_canonical)

  return sourceWins
    ? { survivorCanonical: row.source_canonical, loserCanonical: row.target_canonical }
    : { survivorCanonical: row.target_canonical, loserCanonical: row.source_canonical }
}
