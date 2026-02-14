import axios from "axios"
import { GoogleGenAI } from "@google/genai"
import type { Database } from "./database/supabase"
import { buildUnitStandardizerPrompt, type UnitStandardizerPromptInput } from "./prompts/unit-standardizer/build-prompt"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim()
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview"
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION?.trim()

type UnitLabel = Database["public"]["Enums"]["unit_label"]

export const SUPPORTED_UNIT_LABELS = [
  "oz",
  "lb",
  "fl oz",
  "ml",
  "gal",
  "ct",
  "each",
  "bunch",
  "gram",
  "unit",
] as const satisfies readonly UnitLabel[]

const UNIT_ALIASES: Record<string, UnitLabel> = {
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  "fl oz": "fl oz",
  "fl. oz": "fl oz",
  floz: "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  gal: "gal",
  gallon: "gal",
  gallons: "gal",
  ct: "ct",
  count: "ct",
  each: "each",
  ea: "each",
  bunch: "bunch",
  gram: "gram",
  grams: "gram",
  g: "gram",
  unit: "unit",
}

const EXTRA_UNIT_SIGNAL_PATTERNS: Array<{ pattern: RegExp; unit: UnitLabel }> = [
  { pattern: /\b(?:pack|pk|pkg|package|count)\b/i, unit: "ct" },
  { pattern: /\b(?:ea|each)\b/i, unit: "each" },
]

export interface UnitStandardizationInput {
  id: string
  rawProductName: string
  cleanedName?: string | null
  rawUnit?: string | null
  source: "scraper" | "recipe"
  knownIngredientCanonicalName?: string | null
}

export interface UnitStandardizationResult {
  id: string
  resolvedUnit: UnitLabel | null
  resolvedQuantity: number | null
  confidence: number
  status: "success" | "error"
  error?: string
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  return Promise.race([promise, timeout])
}

function extractJSON(content: string): string | null {
  if (!content) return null

  const cleaned = content.replace(/```json\n?|```/gi, "").trim()
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)

  if (arrayMatch) return arrayMatch[0]
  if (objectMatch) return objectMatch[0]
  return cleaned
}

function parseConfidence(value: unknown, fallback = 0): number {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) return fallback
  return numeric
}

function parseQuantity(value: unknown): number | null {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return numeric
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildAliasPattern(alias: string): RegExp {
  // Match aliases even when attached to digits/punctuation (e.g. "12oz", "750ml", "16-fl-oz")
  const flexibleAlias = escapeRegExp(alias.trim()).replace(/\s+/g, "[\\s.-]*")
  return new RegExp(`(?<![a-z])${flexibleAlias}(?![a-z])`, "i")
}

function extractUnitSignals(input: UnitStandardizationInput): Set<UnitLabel> {
  const raw = `${input.rawUnit ?? ""} ${input.rawProductName}`.trim().toLowerCase()
  if (!raw) return new Set()

  const signals = new Set<UnitLabel>()

  for (const [alias, normalizedUnit] of Object.entries(UNIT_ALIASES)) {
    if (!alias) continue
    const pattern = buildAliasPattern(alias)
    if (pattern.test(raw)) {
      signals.add(normalizedUnit)
    }
  }

  for (const extra of EXTRA_UNIT_SIGNAL_PATTERNS) {
    if (extra.pattern.test(raw)) {
      signals.add(extra.unit)
    }
  }

  return signals
}

function mergeRawProductNameWithUnit(input: UnitStandardizationInput): string {
  const rawProductName = (input.rawProductName ?? "").trim()
  const rawUnit = (input.rawUnit ?? "").trim()
  if (!rawUnit) return rawProductName

  const hasUnitAlready = extractUnitSignals({
    ...input,
    rawUnit: "",
  }).size > 0

  if (hasUnitAlready) return rawProductName
  return `${rawProductName} ${rawUnit}`.trim()
}

export function normalizeUnitLabel(value: unknown): UnitLabel | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ")
  return UNIT_ALIASES[normalized] ?? null
}

function errorResult(inputId: string, error: string): UnitStandardizationResult {
  return {
    id: inputId,
    resolvedUnit: null,
    resolvedQuantity: null,
    confidence: 0,
    status: "error",
    error,
  }
}

function buildHeuristicFallback(input: UnitStandardizationInput): UnitStandardizationResult {
  const raw = `${input.rawUnit ?? ""} ${input.rawProductName}`.trim().toLowerCase()

  const qtyMatch = raw.match(/(\d+(?:\.\d+)?)/)
  const quantity = qtyMatch ? Number.parseFloat(qtyMatch[1] ?? "1") : 1
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1

  let resolvedUnit: UnitLabel | null = null
  for (const [alias, standard] of Object.entries(UNIT_ALIASES)) {
    if (!alias) continue
    const pattern = buildAliasPattern(alias)
    if (pattern.test(raw)) {
      resolvedUnit = standard
      break
    }
  }

  if (!resolvedUnit) {
    return errorResult(input.id, "Unable to infer unit from raw unit/product name")
  }

  return {
    id: input.id,
    resolvedUnit,
    resolvedQuantity: safeQuantity,
    confidence: 0.35,
    status: "success",
  }
}

function parseParsedPayload(
  inputs: UnitStandardizationInput[],
  parsed: unknown
): UnitStandardizationResult[] {
  const entries: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.results)
      ? (parsed as any).results
      : []

  const entriesById = new Map<string, any>()
  entries.forEach((entry) => {
    if (!entry) return
    const entryId =
      typeof entry.id === "string"
        ? entry.id
        : typeof entry.rowId === "string"
          ? entry.rowId
          : undefined
    if (entryId) {
      entriesById.set(entryId, entry)
    }
  })

  return inputs.map((input, index) => {
    const entry = entriesById.get(input.id) ?? entries[index]
    if (!entry) {
      return errorResult(input.id, "No result returned for input")
    }

    const status = typeof entry.status === "string" ? entry.status.toLowerCase() : "success"
    if (status !== "success") {
      return {
        id: String(entry.id ?? entry.rowId ?? input.id),
        resolvedUnit: null,
        resolvedQuantity: null,
        confidence: parseConfidence(entry.confidence ?? entry.confidenceScore, 0),
        status: "error",
        error: typeof entry.error === "string" ? entry.error : "Model returned error status",
      }
    }

    const resolvedUnit = normalizeUnitLabel(
      entry.resolvedUnit ?? entry.standardUnit ?? entry.unit ?? entry.standardizedUnit
    )
    const resolvedQuantity = parseQuantity(entry.resolvedQuantity ?? entry.quantity)
    const confidence = parseConfidence(entry.confidence ?? entry.confidenceScore, 0.5)
    const unitSignals = extractUnitSignals(input)

    if (!resolvedUnit) {
      return errorResult(String(entry.id ?? entry.rowId ?? input.id), "Resolved unit missing/invalid")
    }

    if (!resolvedQuantity) {
      return errorResult(String(entry.id ?? entry.rowId ?? input.id), "Resolved quantity missing/invalid")
    }

    if (!unitSignals.size) {
      return errorResult(
        String(entry.id ?? entry.rowId ?? input.id),
        "No explicit unit found in raw unit/product name"
      )
    }

    if (!unitSignals.has(resolvedUnit)) {
      return errorResult(
        String(entry.id ?? entry.rowId ?? input.id),
        `Resolved unit "${resolvedUnit}" not supported by raw unit/product name`
      )
    }

    return {
      id: String(entry.id ?? entry.rowId ?? input.id),
      resolvedUnit,
      resolvedQuantity,
      confidence,
      status: "success",
    }
  })
}

export function parseUnitStandardizationPayload(
  inputs: UnitStandardizationInput[],
  parsed: unknown
): UnitStandardizationResult[] {
  return parseParsedPayload(inputs, parsed)
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
        temperature: 0.1,
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content: "You standardize grocery units and always return valid JSON.",
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
  } catch (error) {
    console.error("[UnitStandardizer] OpenAI request failed:", error)
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
          temperature: 0.1,
          maxOutputTokens: 1000,
          responseMimeType: "application/json",
        },
      }),
      20000
    )

    return response.text?.trim() ?? null
  } catch (error) {
    console.error("[UnitStandardizer] Gemini request failed:", error)
    return null
  }
}

export async function standardizeUnitsWithAI(
  inputs: UnitStandardizationInput[]
): Promise<UnitStandardizationResult[]> {
  if (!inputs.length) return []

  const normalizedInputs: UnitStandardizerPromptInput[] = inputs.map((input) => ({
    id: input.id,
    rawProductName: mergeRawProductNameWithUnit(input),
    cleanedName: input.cleanedName ?? input.rawProductName,
    rawUnit: input.rawUnit ?? "",
    source: input.source,
    knownIngredientCanonicalName: input.knownIngredientCanonicalName ?? undefined,
  }))

  const hasGemini = Boolean(GEMINI_API_KEY)
  const hasOpenAI = Boolean(OPENAI_API_KEY)
  if (!hasGemini && !hasOpenAI) {
    console.warn("[UnitStandardizer] No AI provider configured; using deterministic fallback parser.")
    return inputs.map(buildHeuristicFallback)
  }

  const useOpenAI = hasOpenAI
  const aiProvider: "OpenAI" | "Gemini" = useOpenAI ? "OpenAI" : "Gemini"
  const requestFn = useOpenAI ? callOpenAI : callGemini

  try {
    const prompt = buildUnitStandardizerPrompt({
      inputs: normalizedInputs,
      allowedUnits: [...SUPPORTED_UNIT_LABELS],
    })
    const content = await withTimeout(requestFn(prompt), 20000)
    if (!content) {
      return inputs.map((input) => errorResult(input.id, `${aiProvider} returned empty content`))
    }

    const extracted = extractJSON(content)
    if (!extracted) {
      return inputs.map((input) => errorResult(input.id, `${aiProvider} returned no parseable JSON`))
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(extracted)
    } catch (error) {
      console.error("[UnitStandardizer] JSON parse error:", error)
      return inputs.map((input) => errorResult(input.id, "Model returned invalid JSON"))
    }

    return parseParsedPayload(inputs, parsed)
  } catch (error) {
    console.error("[UnitStandardizer] Request failed:", error)
    return inputs.map((input) => errorResult(input.id, "Unit standardization request failed"))
  }
}
