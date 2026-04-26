import {
  standardizeIngredientsWithAI,
  type IngredientStandardizationInput,
  type IngredientStandardizationResult,
} from "../ingredient-standardizer"
import {
  standardizeUnitsWithAI,
  type UnitStandardizationInput,
  type UnitStandardizationResult,
} from "../unit-standardizer"
import type { StandardizerOptions, StandardizerProvider } from "../provider"

export class OpenAIProvider implements StandardizerProvider {
  readonly name = "openai"
  readonly model = process.env.OPENAI_MODEL ?? "gpt-4o-mini"

  standardizeIngredients(
    items: IngredientStandardizationInput[],
    opts: StandardizerOptions
  ): Promise<IngredientStandardizationResult[]> {
    return standardizeIngredientsWithAI(items, opts.context)
  }

  standardizeUnits(items: UnitStandardizationInput[]): Promise<UnitStandardizationResult[]> {
    return standardizeUnitsWithAI(items)
  }
}
