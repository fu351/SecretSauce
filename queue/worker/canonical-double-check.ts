import {
  ingredientMatchQueueDB,
} from "../../lib/database/ingredient-match-queue-db"
import { standardizedIngredientsDB } from "../../lib/database/standardized-ingredients-db"
import {
  buildCanonicalQueryTerms,
  type CanonicalCandidate,
  normalizeCanonicalName,
  scoreCanonicalSimilarity,
} from "../../scripts/utils/canonical-matching"
import type { QueueWorkerConfig } from "../config"

const CROSS_CATEGORY_SCORE_PENALTY = 0.5
const CROSS_CATEGORY_MIN_CONFIDENCE = 0.98
const CROSS_CATEGORY_MIN_SIMILARITY_FLOOR = 0.98
const CROSS_CATEGORY_MIN_SIMILARITY_BUFFER = 0.03
const GENERIC_TO_SPECIFIC_MIN_CONFIDENCE = 0.95
const GENERIC_TO_SPECIFIC_MIN_SIMILARITY_FLOOR = 0.9
const GENERIC_TO_SPECIFIC_MIN_SIMILARITY_BUFFER = 0.2
const SPECIFIC_TO_GENERIC_SCORE_PENALTY = 0.1
const SPECIFIC_TO_GENERIC_MIN_CONFIDENCE = 0.9
const SPECIFIC_TO_GENERIC_MIN_SIMILARITY_FLOOR = 0.98
const SPECIFIC_TO_GENERIC_MIN_SIMILARITY_BUFFER = 0.03
const LATERAL_MIN_SIMILARITY_FLOOR = 0.55

export type RemapDirection = "generic_to_specific" | "specific_to_generic" | "lateral"

function toCanonicalTokenSet(value: string): Set<string> {
  return new Set(
    normalizeCanonicalName(value)
      .split(" ")
      .filter(Boolean)
  )
}

export function toCanonicalTokens(value: string): string[] {
  return normalizeCanonicalName(value)
    .split(" ")
    .filter(Boolean)
}

function isTokenSubset(source: Set<string>, target: Set<string>): boolean {
  if (!source.size || !target.size || source.size > target.size) return false
  for (const token of source) {
    if (!target.has(token)) return false
  }
  return true
}

export function resolveRemapDirection(sourceCanonical: string, candidateCanonical: string): RemapDirection {
  const sourceTokens = toCanonicalTokenSet(sourceCanonical)
  const candidateTokens = toCanonicalTokenSet(candidateCanonical)

  const sourceIntoCandidate = isTokenSubset(sourceTokens, candidateTokens)
  const candidateIntoSource = isTokenSubset(candidateTokens, sourceTokens)

  if (sourceIntoCandidate && candidateTokens.size > sourceTokens.size) {
    return "generic_to_specific"
  }
  if (candidateIntoSource && sourceTokens.size > candidateTokens.size) {
    return "specific_to_generic"
  }
  return "lateral"
}

export function meetsAsymmetricRemapPolicy(
  direction: RemapDirection,
  confidence: number,
  similarity: number,
  config: QueueWorkerConfig
): { allowed: boolean; minConfidence: number; minSimilarity: number } {
  if (direction === "generic_to_specific") {
    const minConfidence = Math.max(config.doubleCheckMinConfidence, GENERIC_TO_SPECIFIC_MIN_CONFIDENCE)
    const minSimilarity = Math.max(
      config.doubleCheckMinSimilarity + GENERIC_TO_SPECIFIC_MIN_SIMILARITY_BUFFER,
      GENERIC_TO_SPECIFIC_MIN_SIMILARITY_FLOOR
    )
    return {
      allowed: confidence >= minConfidence && similarity >= minSimilarity,
      minConfidence,
      minSimilarity,
    }
  }

  if (direction === "lateral") {
    const minConfidence = config.doubleCheckMinConfidence
    const minSimilarity = Math.max(config.doubleCheckMinSimilarity, LATERAL_MIN_SIMILARITY_FLOOR)
    return {
      allowed: confidence >= minConfidence && similarity >= minSimilarity,
      minConfidence,
      minSimilarity,
    }
  }

  if (direction === "specific_to_generic") {
    const minConfidence = Math.max(config.doubleCheckMinConfidence, SPECIFIC_TO_GENERIC_MIN_CONFIDENCE)
    const minSimilarity = Math.max(
      config.doubleCheckMinSimilarity + SPECIFIC_TO_GENERIC_MIN_SIMILARITY_BUFFER,
      SPECIFIC_TO_GENERIC_MIN_SIMILARITY_FLOOR
    )
    return {
      allowed: confidence >= minConfidence && similarity >= minSimilarity,
      minConfidence,
      minSimilarity,
    }
  }

  return {
    allowed: confidence >= config.doubleCheckMinConfidence && similarity >= config.doubleCheckMinSimilarity,
    minConfidence: config.doubleCheckMinConfidence,
    minSimilarity: config.doubleCheckMinSimilarity,
  }
}

export function buildCanonicalDoubleCheckTerms(canonicalName: string): string[] {
  const terms = new Set(buildCanonicalQueryTerms(canonicalName))
  const tokens = normalizeCanonicalName(canonicalName)
    .split(" ")
    .filter(Boolean)

  // Product titles are often noisy; include tail noun terms so we can match
  // canonical base ingredients like "egg", "milk", "gravy mix", "red wine".
  if (tokens.length >= 1) {
    terms.add(tokens[tokens.length - 1])
  }
  if (tokens.length >= 2) {
    terms.add(`${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`)
  }

  return Array.from(terms).filter(Boolean)
}

export function logCanonicalDoubleCheckDecision(params: {
  sourceCanonical: string
  targetCanonical: string
  decision: "remapped" | "skipped"
  reason: string
  direction: RemapDirection | "unknown"
  confidence: number
  similarity: number
  sourceCategory: string | null | undefined
  targetCategory: string | null | undefined
}): void {
  void ingredientMatchQueueDB
    .logCanonicalDoubleCheckDaily({
      sourceCanonical: params.sourceCanonical,
      targetCanonical: params.targetCanonical,
      decision: params.decision,
      reason: params.reason,
      direction: params.direction,
      aiConfidence: params.confidence,
      similarity: params.similarity,
      sourceCategory: params.sourceCategory ?? null,
      targetCategory: params.targetCategory ?? null,
    })
    .catch((error) => {
      console.warn("[QueueResolver] Failed to log canonical double-check telemetry:", error)
    })
}

export async function resolveCanonicalWithDoubleCheck(
  canonicalName: string,
  category: string | null | undefined,
  confidence: number,
  config: QueueWorkerConfig
): Promise<string> {
  const normalizedCanonical = normalizeCanonicalName(canonicalName)
  if (!normalizedCanonical) return ""

  if (confidence < config.doubleCheckMinConfidence) {
    return normalizedCanonical
  }

  const exact = await standardizedIngredientsDB.findByCanonicalName(normalizedCanonical)
  if (exact?.canonical_name) {
    return exact.canonical_name
  }

  const queryTerms = buildCanonicalDoubleCheckTerms(normalizedCanonical)
  const collected = new Map<string, CanonicalCandidate>()

  for (const term of queryTerms) {
    const [textMatches, variantMatches] = await Promise.all([
      standardizedIngredientsDB.searchByText(term, { limit: 12 }),
      standardizedIngredientsDB.searchByVariants([term]),
    ])

    for (const row of [...textMatches, ...variantMatches]) {
      const candidateName = normalizeCanonicalName(row.canonical_name || "")
      if (!candidateName) continue
      if (!collected.has(candidateName)) {
        collected.set(candidateName, {
          canonicalName: candidateName,
          category: row.category ?? null,
        })
      }
    }
  }

  if (!collected.size) {
    return normalizedCanonical
  }

  let bestMatch: CanonicalCandidate | null = null
  let bestScore = 0

  for (const candidate of collected.values()) {
    let score = scoreCanonicalSimilarity(normalizedCanonical, candidate.canonicalName)
    const direction = resolveRemapDirection(normalizedCanonical, candidate.canonicalName)

    if (direction === "specific_to_generic") {
      score -= SPECIFIC_TO_GENERIC_SCORE_PENALTY
    }

    if (category && candidate.category && category !== candidate.category) {
      score -= CROSS_CATEGORY_SCORE_PENALTY
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  }

  if (bestMatch && bestScore >= config.doubleCheckMinSimilarity) {
    if (bestMatch.canonicalName !== normalizedCanonical) {
      const direction = resolveRemapDirection(normalizedCanonical, bestMatch.canonicalName)
      const crossCategoryMismatch =
        Boolean(category && bestMatch.category && category !== bestMatch.category)

      if (crossCategoryMismatch) {
        const minCrossCategorySimilarity = Math.min(
          0.999,
          Math.max(
            config.doubleCheckMinSimilarity + CROSS_CATEGORY_MIN_SIMILARITY_BUFFER,
            CROSS_CATEGORY_MIN_SIMILARITY_FLOOR
          )
        )
        if (confidence < CROSS_CATEGORY_MIN_CONFIDENCE || bestScore < minCrossCategorySimilarity) {
          logCanonicalDoubleCheckDecision({
            sourceCanonical: normalizedCanonical,
            targetCanonical: bestMatch.canonicalName,
            decision: "skipped",
            reason: "cross_category_mismatch",
            direction,
            confidence,
            similarity: bestScore,
            sourceCategory: category,
            targetCategory: bestMatch.category,
          })
          console.log(
            `[QueueResolver] Canonical double-check skipped remap "${normalizedCanonical}" -> "${bestMatch.canonicalName}" ` +
              `(reason=cross_category_mismatch, ai_confidence=${confidence.toFixed(2)}, similarity=${bestScore.toFixed(3)}, ` +
              `required_confidence=${CROSS_CATEGORY_MIN_CONFIDENCE.toFixed(2)}, required_similarity=${minCrossCategorySimilarity.toFixed(3)})`
          )
          return normalizedCanonical
        }
      }

      const asymmetricCheck = meetsAsymmetricRemapPolicy(direction, confidence, bestScore, config)
      if (!asymmetricCheck.allowed) {
        logCanonicalDoubleCheckDecision({
          sourceCanonical: normalizedCanonical,
          targetCanonical: bestMatch.canonicalName,
          decision: "skipped",
          reason: `asymmetric_${direction}`,
          direction,
          confidence,
          similarity: bestScore,
          sourceCategory: category,
          targetCategory: bestMatch.category,
        })
        console.log(
          `[QueueResolver] Canonical double-check skipped remap "${normalizedCanonical}" -> "${bestMatch.canonicalName}" ` +
            `(reason=asymmetric_${direction}, ai_confidence=${confidence.toFixed(2)}, similarity=${bestScore.toFixed(3)}, ` +
            `required_confidence=${asymmetricCheck.minConfidence.toFixed(2)}, required_similarity=${asymmetricCheck.minSimilarity.toFixed(3)})`
        )
        return normalizedCanonical
      }

      logCanonicalDoubleCheckDecision({
        sourceCanonical: normalizedCanonical,
        targetCanonical: bestMatch.canonicalName,
        decision: "remapped",
        reason: "applied",
        direction,
        confidence,
        similarity: bestScore,
        sourceCategory: category,
        targetCategory: bestMatch.category,
      })
      console.log(
        `[QueueResolver] High-confidence canonical double-check remapped "${normalizedCanonical}" -> "${bestMatch.canonicalName}" ` +
          `(ai_confidence=${confidence.toFixed(2)}, similarity=${bestScore.toFixed(3)}, direction=${direction})`
      )
    }
    return bestMatch.canonicalName
  }

  if (bestMatch && bestMatch.canonicalName !== normalizedCanonical) {
    logCanonicalDoubleCheckDecision({
      sourceCanonical: normalizedCanonical,
      targetCanonical: bestMatch.canonicalName,
      decision: "skipped",
      reason: "below_similarity_threshold",
      direction: resolveRemapDirection(normalizedCanonical, bestMatch.canonicalName),
      confidence,
      similarity: bestScore,
      sourceCategory: category,
      targetCategory: bestMatch.category,
    })
  }

  return normalizedCanonical
}
