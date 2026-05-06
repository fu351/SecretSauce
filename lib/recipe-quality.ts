import type { ImportedRecipe } from "@/lib/types"

export interface QualityResult {
  passed: boolean
  score: number
  issues: QualityIssue[]
}

export type QualityIssue =
  | "missing_title"
  | "bad_title_length"
  | "no_ingredients"
  | "low_ingredients"
  | "no_instructions"
  | "low_instructions"
  | "garbled_ingredients"
  | "high_duplicates"

export const QUALITY_ISSUE_LABELS: Record<QualityIssue, string> = {
  missing_title: "Recipe title is missing",
  bad_title_length: "Recipe title is too short or too long",
  no_ingredients: "No ingredients were detected",
  low_ingredients: "Fewer than 3 ingredients detected",
  no_instructions: "No instructions were detected",
  low_instructions: "Only 1 instruction step detected",
  garbled_ingredients: "Ingredient names appear garbled or unreadable",
  high_duplicates: "Many duplicate ingredient names detected",
}

const HARD_FAIL_ISSUES = new Set<QualityIssue>([
  "missing_title",
  "no_ingredients",
  "no_instructions",
])

export const MIN_QUALITY_SCORE = 0.95

export function checkRecipeQuality(
  recipe: ImportedRecipe,
  minScore = MIN_QUALITY_SCORE
): QualityResult {
  const issues: QualityIssue[] = []
  const weights: Record<string, number> = {}
  const scores: Record<string, number> = {}

  const title = (recipe.title ?? "").trim()
  const ingredients = recipe.ingredients ?? []
  const instructions = recipe.instructions ?? []

  // Title presence and length (weight: 15%)
  weights.title = 0.15
  if (!title) {
    issues.push("missing_title")
    scores.title = 0.0
  } else if (title.length < 5 || title.length > 120) {
    issues.push("bad_title_length")
    scores.title = 0.3
  } else {
    scores.title = 1.0
  }

  // Ingredient count — ≥3 expected (weight: 35%)
  weights.ing_count = 0.35
  const ingCount = ingredients.length
  if (ingCount === 0) {
    issues.push("no_ingredients")
    scores.ing_count = 0.0
  } else if (ingCount < 3) {
    issues.push("low_ingredients")
    scores.ing_count = 0.4
  } else {
    scores.ing_count = Math.min(1.0, ingCount / 8)
  }

  // Instruction count — ≥2 expected (weight: 25%)
  weights.inst_count = 0.25
  const instCount = instructions.length
  if (instCount === 0) {
    issues.push("no_instructions")
    scores.inst_count = 0.0
  } else if (instCount < 2) {
    issues.push("low_instructions")
    scores.inst_count = 0.5
  } else {
    scores.inst_count = Math.min(1.0, instCount / 5)
  }

  // Average ingredient name length — ≥3 chars expected (weight: 15%)
  weights.ing_quality = 0.15
  if (ingredients.length > 0) {
    const names = ingredients.map((ing) => (ing.name ?? "").trim())
    const avgLen = names.reduce((sum, n) => sum + n.length, 0) / Math.max(names.length, 1)
    if (avgLen < 3) {
      issues.push("garbled_ingredients")
      scores.ing_quality = 0.0
    } else {
      scores.ing_quality = Math.min(1.0, avgLen / 10)
    }
  } else {
    scores.ing_quality = 0.0
  }

  // Duplicate ingredient names — unique ratio must be ≥50% (weight: 10%)
  weights.dedup = 0.1
  if (ingredients.length > 0) {
    const namesLower = ingredients
      .map((ing) => (ing.name ?? "").trim().toLowerCase())
      .filter(Boolean)
    const uniqueRatio = new Set(namesLower).size / Math.max(namesLower.length, 1)
    if (uniqueRatio < 0.5) {
      issues.push("high_duplicates")
      scores.dedup = 0.0
    } else {
      scores.dedup = uniqueRatio
    }
  } else {
    scores.dedup = 1.0
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  const score =
    Object.keys(weights).reduce((sum, k) => sum + weights[k] * scores[k], 0) / totalWeight
  const rounded = Math.round(score * 1000) / 1000

  const hasHardFail = issues.some((i) => HARD_FAIL_ISSUES.has(i))

  return {
    passed: rounded >= minScore && !hasHardFail,
    score: rounded,
    issues,
  }
}
