import axios from "axios"
import { buildParagraphParserPrompt } from "./prompts/paragraph-parser/build-prompt"
import type { Instruction } from "./types/recipe/instruction"
import type { RecipeIngredient } from "./types/recipe/ingredient"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini"

export interface ParagraphParseResult {
  instructions: Instruction[]
  ingredients: RecipeIngredient[]
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

function extractJSON(content: string): string | null {
  if (!content) return null

  const cleaned = content.replace(/```json\n?|```/gi, "").trim()

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)

  if (arrayMatch) {
    return arrayMatch[0]
  } else if (objectMatch) {
    return objectMatch[0]
  }

  return cleaned
}

async function callOpenAI(prompt: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null

  const response = await axios.post(
    OPENAI_URL,
    {
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: "You are a recipe parsing engine. Always return valid JSON matching the requested schema.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  )

  return response.data?.choices?.[0]?.message?.content?.trim() ?? null
}

// Matches known section headers like "Ingredients:", "Instructions:", "Method:", "For the sauce:"
const HEADER_RE = /^(ingredients?|directions?|instructions?|method|steps?|preparation|for the [\w\s]+)\s*:?\s*$/i
// Ingredient line: starts with a digit, unicode fraction, or bullet character
const INGREDIENT_START_RE = /^([\d½⅓⅔¼¾⅛⅜⅝⅞]|[-•*–·]\s)/
// Numbered step: "1." / "1)" / "Step 1:" / "Step 1."
const STEP_NUMBER_RE = /^(step\s+\d+[.:)]|\d+[.)]\s)/i

export function preprocessRecipeText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ""
      if (HEADER_RE.test(trimmed)) return `[SECTION: ${trimmed}]`
      if (INGREDIENT_START_RE.test(trimmed)) return `[INGREDIENT] ${trimmed}`
      if (STEP_NUMBER_RE.test(trimmed)) return `[STEP] ${trimmed}`
      return trimmed
    })
    .join("\n")
}

function fallbackResult(): ParagraphParseResult {
  return { instructions: [], ingredients: [] }
}

function coerceResult(parsed: any): ParagraphParseResult {
  const root = Array.isArray(parsed) ? parsed[0] : parsed

  const rawInstructions: any[] = Array.isArray(root?.instructions) ? root.instructions : []
  const rawIngredients: any[] = Array.isArray(root?.ingredients) ? root.ingredients : []

  const instructions: Instruction[] = rawInstructions
    .filter((s: any) => typeof s?.description === "string" && s.description.trim().length > 0)
    .map((s: any, index: number) => ({
      step: typeof s.step === "number" ? s.step : index + 1,
      description: s.description.trim(),
    }))

  const ingredients: RecipeIngredient[] = rawIngredients
    .filter((i: any) => typeof i?.name === "string" && i.name.trim().length > 0)
    .map((i: any) => ({
      name: i.name.trim().toLowerCase(),
      quantity:
        typeof i.quantity === "number"
          ? i.quantity
          : typeof i.quantity === "string" && !isNaN(parseFloat(i.quantity))
            ? parseFloat(i.quantity)
            : undefined,
      unit:
        typeof i.unit === "string" && i.unit.trim().length > 0 ? i.unit.trim() : undefined,
    }))

  return { instructions, ingredients }
}

export async function parseRecipeParagraphWithAI(text: string): Promise<ParagraphParseResult> {
  if (!text?.trim()) return fallbackResult()

  if (!OPENAI_API_KEY) {
    console.warn("[ParagraphParser] OPENAI_API_KEY not configured; returning empty result")
    return fallbackResult()
  }

  const prompt = buildParagraphParserPrompt({ text: preprocessRecipeText(text) })

  try {
    const content = await withTimeout(callOpenAI(prompt), 30000)
    if (!content) {
      console.warn("[ParagraphParser] OpenAI returned empty content")
      return fallbackResult()
    }

    const extracted = extractJSON(content)
    if (!extracted) {
      console.error("[ParagraphParser] Could not extract JSON from OpenAI response")
      console.error("[ParagraphParser] Raw response:", content.substring(0, 300))
      return fallbackResult()
    }

    const parsed = JSON.parse(extracted)
    return coerceResult(parsed)
  } catch (error) {
    console.error("[ParagraphParser] OpenAI failed:", error)
    return fallbackResult()
  }
}
