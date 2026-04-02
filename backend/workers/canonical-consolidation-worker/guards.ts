import type { CanonicalDoubleCheckDailyStatsRow } from "../../../lib/database/ingredient-match-queue-db"
import { normalizeCanonicalName, singularizeCanonicalName } from "../../scripts/utils/canonical-matching"

export interface ConsolidationCandidateAssessment {
  allowed: boolean
  reason: string
}

export interface WeightedHeuristicContext {
  productCounts: Map<string, number>
  weightedSimilarityThreshold: number
  minWeightedProductCount: number
}

function stripSimplePluralS(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => (token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token))
    .join(" ")
}

export function assessConsolidationCandidate(
  row: CanonicalDoubleCheckDailyStatsRow,
  context?: WeightedHeuristicContext
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

  // Weighted Lp heuristic: non-trivial lateral variants may still be safe to
  // consolidate when embedding similarity is very high AND both canonicals have
  // meaningful product usage. High product counts act as weights in the
  // projection space — the more products reference an ingredient, the more
  // confident we can be that a near-identical embedding truly means the same
  // underlying ingredient.
  if (context) {
    const sourceCount = context.productCounts.get(row.source_canonical) ?? 0
    const targetCount = context.productCounts.get(row.target_canonical) ?? 0
    const geometricMean = Math.sqrt(sourceCount * targetCount)
    const similarity = row.max_similarity ?? 0

    if (
      similarity >= context.weightedSimilarityThreshold &&
      geometricMean >= context.minWeightedProductCount
    ) {
      return { allowed: true, reason: "weighted_product_count_vector_match" }
    }
  }

  return { allowed: false, reason: "non_trivial_lateral_variant_requires_manual_review" }
}
