import axios from "axios"
import { GoogleGenAI } from "@google/genai"
import { buildParagraphParserPrompt } from "./prompts/paragraph-parser/build-prompt"
import type { Instruction } from "./types/recipe/instruction"
import type { RecipeIngredient } from "./types/recipe/ingredient"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim()
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview"
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION?.trim()

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

  let cleaned = content.replace(/```json\n?|```/gi, "").trim()

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)

  if (arrayMatch) {
    return arrayMatch[0]
  } else if (objectMatch) {
    return objectMatch[0]
  }

  return cleaned
}

const geminiClient = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      ...(GEMINI_API_VERSION ? { apiVersion: GEMINI_API_VERSION } : {}),
    })
  : null

async function callOpenAI(prompt: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null

  try {
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

    const content = response.data?.choices?.[0]?.message?.content?.trim()
    if (!content) {
      console.warn("[ParagraphParser] Empty response from OpenAI")
      return null
    }
    return content
  } catch (error) {
    console.error("[ParagraphParser] OpenAI request failed:", error)
    return null
  }
}

async function callGemini(prompt: string): Promise<string | null> {
  if (!geminiClient) return null

  try {
    const response = await withTimeout(
      geminiClient.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          temperature: 0,
          maxOutputTokens: 2000,
          responseMimeType: "application/json",
        },
      }),
      30000
    )

    const text = response.text?.trim()
    if (!text) {
      console.warn("[ParagraphParser] Empty response from Gemini")
      return null
    }
    return text
  } catch (error) {
    console.error("[ParagraphParser] Gemini request failed:", error)
    return null
  }
}

function fallbackResult(): ParagraphParseResult {
  return { instructions: [], ingredients: [] }
}

function coerceResult(parsed: any): ParagraphParseResult {
  // Handle LLM wrapping output in an array: [{instructions, ingredients}]
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

async function attemptParse(requestFn: (p: string) => Promise<string | null>, prompt: string, provider: string): Promise<ParagraphParseResult | null> {
  const content = await withTimeout(requestFn(prompt), 30000)
  if (!content) {
    console.warn(`[ParagraphParser] ${provider} returned empty content`)
    return null
  }

  const extracted = extractJSON(content)
  if (!extracted) {
    console.error(`[ParagraphParser] Could not extract JSON from ${provider} response`)
    return null
  }

  let parsed: any
  try {
    parsed = JSON.parse(extracted)
  } catch {
    console.error(`[ParagraphParser] JSON parse error from ${provider}`)
    return null
  }

  return coerceResult(parsed)
}

export async function parseRecipeParagraphWithAI(text: string): Promise<ParagraphParseResult> {
  if (!text?.trim()) return fallbackResult()

  const hasOpenAI = Boolean(OPENAI_API_KEY)
  const hasGemini = Boolean(GEMINI_API_KEY)

  if (!hasOpenAI && !hasGemini) {
    console.warn("[ParagraphParser] No AI keys configured; returning empty result")
    return fallbackResult()
  }

  const prompt = buildParagraphParserPrompt({ text })

  // OpenAI preferred
  if (hasOpenAI) {
    try {
      const result = await attemptParse(callOpenAI, prompt, "OpenAI")
      if (result) return result
    } catch (error) {
      console.error("[ParagraphParser] OpenAI failed:", error)
    }

    // Fallback to Gemini if available
    if (hasGemini) {
      console.log("[ParagraphParser] Attempting Gemini fallback...")
      try {
        const result = await attemptParse(callGemini, prompt, "Gemini")
        if (result) return result
      } catch (error) {
        console.error("[ParagraphParser] Gemini fallback failed:", error)
      }
    }

    return fallbackResult()
  }

  // Gemini only
  try {
    const result = await attemptParse(callGemini, prompt, "Gemini")
    if (result) return result
  } catch (error) {
    console.error("[ParagraphParser] Gemini failed:", error)
  }

  return fallbackResult()
}
