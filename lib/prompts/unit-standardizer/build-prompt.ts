import { formatPromptInputJson, stringifyPromptList, STRICT_JSON_RESPONSE_RULE } from "../shared/json-output"
import {
  UNIT_CONFIDENCE_SECTION,
  UNIT_OUTPUT_SECTION,
  UNIT_STANDARDIZATION_RULES_SECTION,
} from "./sections"

export interface UnitStandardizerPromptInput {
  id: string
  rawProductName: string
  cleanedName: string
  rawUnit: string
  source: "scraper" | "recipe"
  knownIngredientCanonicalName?: string
}

interface BuildUnitStandardizerPromptParams {
  inputs: UnitStandardizerPromptInput[]
  allowedUnits: string[]
}

export function buildUnitStandardizerPrompt({
  inputs,
  allowedUnits,
}: BuildUnitStandardizerPromptParams): string {
  const unitList = stringifyPromptList(allowedUnits, allowedUnits.length, "unit")

  return `
You are a unit standardization engine for a grocery ingestion queue.
Prompt version: unit-v1.

${STRICT_JSON_RESPONSE_RULE}

**GOAL:**
- For each input row, resolve:
  1) \`resolvedUnit\` (must be one of allowed units)
  2) \`resolvedQuantity\` (must be finite and > 0)
  3) \`confidence\` in [0, 1]

**ALLOWED UNIT LABELS:**
${unitList}

${UNIT_STANDARDIZATION_RULES_SECTION}

${UNIT_CONFIDENCE_SECTION}

${UNIT_OUTPUT_SECTION}

**INPUT ROWS:**
${formatPromptInputJson(inputs)}
`
}
