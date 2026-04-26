import type {
  IngredientStandardizationInput,
  IngredientStandardizationResult,
} from "../ingredient-standardizer"
import type { UnitStandardizationInput, UnitStandardizationResult } from "../unit-standardizer"
import type { StandardizerOptions, StandardizerProvider } from "../provider"

// Stub for Phase 6. Returns zero-confidence results so every item lands in manual review.
export class DeterministicProvider implements StandardizerProvider {
  readonly name = "deterministic"
  readonly model = "deterministic-v0"

  standardizeIngredients(
    items: IngredientStandardizationInput[],
    _opts: StandardizerOptions
  ): Promise<IngredientStandardizationResult[]> {
    return Promise.resolve(
      items.map((item, index) => ({
        id: String(item.id ?? index),
        originalName: item.name,
        canonicalName: item.name.toLowerCase(),
        isFoodItem: false,
        category: null,
        confidence: 0,
      }))
    )
  }

  standardizeUnits(items: UnitStandardizationInput[]): Promise<UnitStandardizationResult[]> {
    return Promise.resolve(
      items.map((item) => ({
        id: item.id,
        resolvedUnit: null,
        resolvedQuantity: null,
        confidence: 0,
        status: "error" as const,
        error: "deterministic provider not yet implemented",
      }))
    )
  }
}
