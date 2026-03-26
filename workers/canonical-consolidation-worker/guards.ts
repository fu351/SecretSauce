import type { CanonicalDoubleCheckDailyStatsRow } from "../../lib/database/ingredient-match-queue-db"
import { normalizeCanonicalName, singularizeCanonicalName } from "../../backend/scripts/utils/canonical-matching"

export interface ConsolidationCandidateAssessment {
  allowed: boolean
  reason: string
}

function stripSimplePluralS(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => (token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token))
    .join(" ")
}

export function assessConsolidationCandidate(
  row: CanonicalDoubleCheckDailyStatsRow
): ConsolidationCandidateAssessment {
  const sourceCategory = row.source_category?.trim() || null
  const targetCategory = row.target_category?.trim() || null

  if (sourceCategory && targetCategory && sourceCategory !== targetCategory) {
    return { allowed: false, reason: "cross_category_requires_manual_review" }
  }

  if (row.direction !== "lateral") {
    return { allowed: false, reason: `direction_${row.direction}_requires_manual_review` }
  }

  const normalizedSource = normalizeCanonicalName(row.source_canonical)
  const normalizedTarget = normalizeCanonicalName(row.target_canonical)

  if (!normalizedSource || !normalizedTarget) {
    return { allowed: false, reason: "empty_canonical_name" }
  }

  if (normalizedSource === normalizedTarget) {
    return { allowed: true, reason: "exact_normalized_match" }
  }

  if (stripSimplePluralS(normalizedSource) === stripSimplePluralS(normalizedTarget)) {
    return { allowed: true, reason: "simple_plural_s_match" }
  }

  if (singularizeCanonicalName(normalizedSource) === singularizeCanonicalName(normalizedTarget)) {
    return { allowed: true, reason: "singularized_match" }
  }

  return { allowed: false, reason: "non_trivial_lateral_variant_requires_manual_review" }
}
