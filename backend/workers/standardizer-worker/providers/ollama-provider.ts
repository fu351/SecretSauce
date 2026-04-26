import axios from "axios"
import { standardizedIngredientsDB } from "../../../../lib/database/standardized-ingredients-db"
import { buildIngredientStandardizerPrompt } from "../prompts/ingredient/build-prompt"
import { buildUnitStandardizerPrompt } from "../prompts/unit/build-prompt"
import {
  getIngredientStandardizerContextRules,
  parseIngredientStandardizationPayload,
  type IngredientStandardizationInput,
  type IngredientStandardizationResult,
} from "../ingredient-standardizer"
import {
  normalizeUnitStandardizerInputs,
  parseUnitStandardizationPayload,
  SUPPORTED_UNIT_LABELS,
  type UnitStandardizationInput,
  type UnitStandardizationResult,
} from "../unit-standardizer"
import type { StandardizerOptions, StandardizerProvider } from "../provider"

const LOCAL_LLM_BASE_URL = process.env.LOCAL_LLM_BASE_URL
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL ?? "qwen2.5:7b"

function extractJSON(content: string): string | null {
  if (!content) return null
  const cleaned = content.replace(/```json\n?|```/gi, "").trim()
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)
  if (arrayMatch) return arrayMatch[0]
  if (objectMatch) return objectMatch[0]
  return cleaned
}

async function callLocal(systemPrompt: string, userPrompt: string): Promise<string | null> {
  if (!LOCAL_LLM_BASE_URL) {
    throw new Error("[OllamaProvider] LOCAL_LLM_BASE_URL is not set")
  }

  const response = await axios.post(
    `${LOCAL_LLM_BASE_URL}/v1/chat/completions`,
    {
      model: LOCAL_LLM_MODEL,
      temperature: 0,
      max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
    { headers: { "Content-Type": "application/json" } }
  )

  return response.data?.choices?.[0]?.message?.content?.trim() ?? null
}

export class OllamaProvider implements StandardizerProvider {
  readonly name = "ollama"
  readonly model = LOCAL_LLM_MODEL

  async standardizeIngredients(
    items: IngredientStandardizationInput[],
    opts: StandardizerOptions
  ): Promise<IngredientStandardizationResult[]> {
    if (!items.length) return []

    const canonicalNames = await standardizedIngredientsDB.getCanonicalNameSample(200)
    const contextRules = getIngredientStandardizerContextRules(opts.context)
    const prompt = buildIngredientStandardizerPrompt({
      inputs: items,
      canonicalNames,
      context: opts.context,
      contextRules,
    })

    const content = await callLocal(
      "You standardize ingredient names for a cooking application and always return valid JSON.",
      prompt
    )
    if (!content) throw new Error("[OllamaProvider] Empty response for ingredients")

    const extracted = extractJSON(content)
    if (!extracted) throw new Error("[OllamaProvider] No parseable JSON in ingredient response")

    return parseIngredientStandardizationPayload(items, JSON.parse(extracted))
  }

  async standardizeUnits(items: UnitStandardizationInput[]): Promise<UnitStandardizationResult[]> {
    if (!items.length) return []

    const normalizedInputs = normalizeUnitStandardizerInputs(items)
    const prompt = buildUnitStandardizerPrompt({
      inputs: normalizedInputs,
      allowedUnits: [...SUPPORTED_UNIT_LABELS],
    })

    const content = await callLocal(
      "You standardize grocery units and always return valid JSON.",
      prompt
    )
    if (!content) throw new Error("[OllamaProvider] Empty response for units")

    const extracted = extractJSON(content)
    if (!extracted) throw new Error("[OllamaProvider] No parseable JSON in unit response")

    return parseUnitStandardizationPayload(items, JSON.parse(extracted))
  }
}
