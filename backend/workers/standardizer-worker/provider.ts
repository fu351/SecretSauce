import type {
  IngredientStandardizationInput,
  IngredientStandardizationResult,
  IngredientStandardizerContext,
} from "./ingredient-standardizer"
import type { UnitStandardizationInput, UnitStandardizationResult } from "./unit-standardizer"

export interface StandardizerOptions {
  context: IngredientStandardizerContext
  hintCandidates?: string[]
  canonicalSample?: string[]
}

export interface StandardizerProvider {
  readonly name: string
  readonly model: string

  standardizeIngredients(
    items: IngredientStandardizationInput[],
    opts: StandardizerOptions
  ): Promise<IngredientStandardizationResult[]>

  standardizeUnits(items: UnitStandardizationInput[]): Promise<UnitStandardizationResult[]>
}
