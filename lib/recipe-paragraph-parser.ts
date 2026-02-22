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

async function callOpenAI(prompt: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null

  const response = await axios.post(
    OPENAI_URL,
    {
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_object" },
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

// ─── Preprocessing ────────────────────────────────────────────────────────────

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
}

const HEADER_RE = /^(ingredients?|directions?|instructions?|method|steps?|preparation|for the [\w\s]+)\s*:?\s*$/i
const INGREDIENT_START_RE = /^([\d½⅓⅔¼¾⅛⅜⅝⅞]|\d+\/\d+|[-•*–·]\s)/
const STEP_NUMBER_RE = /^(step\s+\d+[.:)]|\d+[.)]\s)/i
const SENTENCE_BOUNDARY_RE = /(?<=[.!?])\s+(?=[A-Z])/

type ParagraphType = "header" | "ingredients" | "instructions" | "unknown"

function normalizeFractions(line: string): string {
  return Object.entries(UNICODE_FRACTIONS).reduce(
    (t, [unicode, ascii]) => t.replaceAll(unicode, ascii),
    line
  )
}

function classifyParagraph(lines: string[]): ParagraphType {
  if (lines.length === 1 && HEADER_RE.test(lines[0])) return "header"

  const ingredientCount = lines.filter((l) => INGREDIENT_START_RE.test(l)).length
  const stepCount = lines.filter((l) => STEP_NUMBER_RE.test(l)).length

  // Majority vote: if more than half the lines look like ingredients → ingredient block
  if (ingredientCount > 0 && ingredientCount >= lines.length / 2) return "ingredients"
  // Majority vote: if more than half the lines are numbered steps → instruction block
  if (stepCount > 0 && stepCount >= lines.length / 2) return "instructions"
  // Single long prose line with no quantity markers → instruction prose
  if (lines.length === 1 && lines[0].length > 60 && !INGREDIENT_START_RE.test(lines[0])) return "instructions"

  return "unknown"
}

function formatIngredientParagraph(lines: string[]): string[] {
  return lines.map((line) => `[INGREDIENT] ${line}`)
}

function formatInstructionParagraph(lines: string[]): string[] {
  const output: string[] = []
  for (const line of lines) {
    if (STEP_NUMBER_RE.test(line)) {
      output.push(`[STEP] ${line}`)
    } else {
      // Prose: split on sentence boundaries, emit each sentence as its own [STEP]
      const sentences = line.split(SENTENCE_BOUNDARY_RE)
      for (const sentence of sentences) {
        const s = sentence.trim()
        if (s) output.push(`[STEP] ${s}`)
      }
    }
  }
  return output
}

export function preprocessRecipeText(text: string): string {
  // Normalize line endings and unicode fractions
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => normalizeFractions(l.trim()))
    .join("\n")

  // Split into paragraphs (separated by one or more blank lines)
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

  const output: string[] = []

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue

    const type = classifyParagraph(lines)

    switch (type) {
      case "header":
        output.push(`[SECTION: ${lines[0]}]`)
        break
      case "ingredients":
        output.push(...formatIngredientParagraph(lines))
        break
      case "instructions":
        output.push(...formatInstructionParagraph(lines))
        break
      default:
        // Unknown: label what we can, pass the rest through
        output.push(
          ...lines.map((line) => {
            if (INGREDIENT_START_RE.test(line)) return `[INGREDIENT] ${line}`
            if (STEP_NUMBER_RE.test(line)) return `[STEP] ${line}`
            return line
          })
        )
    }

    output.push("") // blank line between paragraphs
  }

  return output.join("\n").trim()
}

// ─── Result helpers ───────────────────────────────────────────────────────────

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

// ─── Main export ──────────────────────────────────────────────────────────────

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

    // response_format: json_object guarantees valid JSON — parse directly.
    // Only attempt regex extraction as a last resort for unexpected responses.
    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      // Strip markdown fences if somehow present and try once more
      const stripped = content.replace(/```json\n?|```/gi, "").trim()
      const objectMatch = stripped.match(/\{[\s\S]*\}/)
      if (!objectMatch) {
        console.error("[ParagraphParser] Could not extract JSON from OpenAI response")
        console.error("[ParagraphParser] Raw response:", content.substring(0, 300))
        return fallbackResult()
      }
      parsed = JSON.parse(objectMatch[0])
    }

    return coerceResult(parsed)
  } catch (error) {
    console.error("[ParagraphParser] OpenAI failed:", error)
    return fallbackResult()
  }
}
