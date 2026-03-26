import {
  resolveIngredientStandardizerContext,
  standardizeIngredientsWithAI,
  type IngredientStandardizationInput,
  type IngredientStandardizationResult,
  type IngredientStandardizerContext,
} from "./ingredient-standardizer"
import { standardizeUnitsWithAI, type UnitStandardizationInput, type UnitStandardizationResult } from "./unit-standardizer"
import {
  summarizeIngredientStandardization,
  summarizeUnitStandardization,
  type StandardizerRunSummary,
} from "./utils"

export interface IngredientStandardizationProcessorJob {
  mode: "ingredient"
  inputs: IngredientStandardizationInput[]
  context: string | IngredientStandardizerContext | null | undefined
}

export interface UnitStandardizationProcessorJob {
  mode: "unit"
  inputs: UnitStandardizationInput[]
}

export type StandardizerProcessorJob = IngredientStandardizationProcessorJob | UnitStandardizationProcessorJob

export interface IngredientStandardizationProcessorResult {
  mode: "ingredient"
  context: IngredientStandardizerContext
  results: IngredientStandardizationResult[]
  summary: StandardizerRunSummary
}

export interface UnitStandardizationProcessorResult {
  mode: "unit"
  results: UnitStandardizationResult[]
  summary: StandardizerRunSummary
}

export type StandardizerProcessorResult =
  | IngredientStandardizationProcessorResult
  | UnitStandardizationProcessorResult

export async function runStandardizerProcessor(
  job: StandardizerProcessorJob
): Promise<StandardizerProcessorResult> {
  if (job.mode === "ingredient") {
    const context = resolveIngredientStandardizerContext(job.context)
    const results = await standardizeIngredientsWithAI(job.inputs, context)
    return {
      mode: "ingredient",
      context,
      results,
      summary: summarizeIngredientStandardization(job.inputs.length, results),
    }
  }

  const results = await standardizeUnitsWithAI(job.inputs)
  return {
    mode: "unit",
    results,
    summary: summarizeUnitStandardization(job.inputs.length, results),
  }
}
