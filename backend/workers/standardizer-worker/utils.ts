import type { IngredientStandardizationResult } from "./ingredient-standardizer"
import type { UnitStandardizationResult } from "./unit-standardizer"

export interface StandardizerRunSummary {
  requested: number
  succeeded: number
  failed: number
}

export function summarizeIngredientStandardization(
  requestedCount: number,
  results: IngredientStandardizationResult[]
): StandardizerRunSummary {
  const succeeded = results.length
  const failed = Math.max(0, requestedCount - succeeded)
  return { requested: requestedCount, succeeded, failed }
}

export function summarizeUnitStandardization(
  requestedCount: number,
  results: UnitStandardizationResult[]
): StandardizerRunSummary {
  const failed = results.filter((result) => result.status === "error").length
  const succeeded = Math.max(0, results.length - failed)
  return { requested: requestedCount, succeeded, failed }
}
