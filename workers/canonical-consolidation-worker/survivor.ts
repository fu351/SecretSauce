import type { CanonicalDoubleCheckDailyStatsRow } from "../../lib/database/ingredient-match-queue-db"

export interface SurvivorSelection {
  survivorCanonical: string
  loserCanonical: string
}

/**
 * Determines which canonical survives a merge:
 * - lateral: shorter name wins (deterministic tie-break: lexicographic)
 * - specific_to_generic: target is the generic, so target survives
 */
export function selectSurvivor(row: CanonicalDoubleCheckDailyStatsRow): SurvivorSelection {
  if (row.direction === "specific_to_generic") {
    return { survivorCanonical: row.target_canonical, loserCanonical: row.source_canonical }
  }

  // lateral: prefer shorter name
  const sourceWins =
    row.source_canonical.length < row.target_canonical.length ||
    (row.source_canonical.length === row.target_canonical.length &&
      row.source_canonical <= row.target_canonical)

  return sourceWins
    ? { survivorCanonical: row.source_canonical, loserCanonical: row.target_canonical }
    : { survivorCanonical: row.target_canonical, loserCanonical: row.source_canonical }
}
