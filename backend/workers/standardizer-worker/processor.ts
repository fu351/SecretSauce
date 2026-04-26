import {
  resolveIngredientStandardizerContext,
  type IngredientStandardizationInput,
  type IngredientStandardizationResult,
  type IngredientStandardizerContext,
} from "./ingredient-standardizer"
import { type UnitStandardizationInput, type UnitStandardizationResult } from "./unit-standardizer"
import {
  summarizeIngredientStandardization,
  summarizeUnitStandardization,
  type StandardizerRunSummary,
} from "./utils"
import { getActiveProvider } from "./provider-router"

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
  job: IngredientStandardizationProcessorJob
): Promise<IngredientStandardizationProcessorResult>
export async function runStandardizerProcessor(
  job: UnitStandardizationProcessorJob
): Promise<UnitStandardizationProcessorResult>
export async function runStandardizerProcessor(
  job: StandardizerProcessorJob
): Promise<StandardizerProcessorResult>
export async function runStandardizerProcessor(
  job: StandardizerProcessorJob
): Promise<StandardizerProcessorResult> {
  const provider = getActiveProvider()

  if (job.mode === "ingredient") {
    const context = resolveIngredientStandardizerContext(job.context)
    const opts = { context }
    const results = await provider.standardizeIngredients(job.inputs, opts)

    return {
      mode: "ingredient",
      context,
      results,
      summary: summarizeIngredientStandardization(job.inputs.length, results),
    }
  }

  const results = await provider.standardizeUnits(job.inputs)

  return {
    mode: "unit",
    results,
    summary: summarizeUnitStandardization(job.inputs.length, results),
  }
}
