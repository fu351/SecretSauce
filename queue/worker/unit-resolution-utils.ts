import type { IngredientMatchQueueRow } from "../../lib/database/ingredient-match-queue-db"
import type { UnitStandardizationResult } from "../../lib/unit-standardizer"
import { escapeRegExp, normalizeSpaces } from "../../lib/utils/string"

export const UNIT_FALLBACK_CONFIDENCE = 0.2
const PACKAGED_ITEM_SIGNAL_PATTERN =
  /\b(pack|pk|pkg|package|bag|bags|box|boxes|bottle|bottles|can|cans|jar|jars|carton|cartons|tray|trays|case|cases|pouch|pouches|unit|each|ea|ct|count)\b/i

export const RESOLVED_UNIT_ALIASES: Record<string, string[]> = {
  oz: ["oz", "ounce", "ounces"],
  lb: ["lb", "lbs", "pound", "pounds"],
  "fl oz": ["fl oz", "fl. oz", "floz", "fluid ounce", "fluid ounces"],
  ml: ["ml", "milliliter", "milliliters"],
  gal: ["gal", "gallon", "gallons"],
  ct: ["ct", "count"],
  each: ["each", "ea"],
  bunch: ["bunch"],
  gram: ["gram", "grams", "g"],
  unit: ["unit"],
}

export const GENERIC_MEASURE_ALIASES = [
  "cup",
  "cups",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
  "clove",
  "cloves",
  "stalk",
  "stalks",
  "sprig",
  "sprigs",
  "pinch",
  "dash",
  "glug",
  "can",
  "cans",
  "jar",
  "jars",
  "package",
  "pkg",
  "pk",
  "bottle",
  "bottles",
]

export function hasUnitAlias(raw: string, alias: string): boolean {
  if (!raw || !alias) return false
  const flexibleAlias = escapeRegExp(alias.trim()).replace(/\s+/g, "[\\s.-]*")
  const pattern = new RegExp(`(?<![a-z])${flexibleAlias}(?![a-z])`, "i")
  return pattern.test(raw)
}

export function hasExplicitUnitSignals(row: IngredientMatchQueueRow): boolean {
  const rawUnit = normalizeSpaces((row.raw_unit || "").toLowerCase())
  if (rawUnit) return true

  const rawText = normalizeSpaces(`${row.cleaned_name || ""} ${row.raw_product_name || ""}`.toLowerCase())
  if (!rawText) return false

  const aliases = new Set<string>([
    ...Object.values(RESOLVED_UNIT_ALIASES).flat(),
    ...GENERIC_MEASURE_ALIASES,
    "pack",
    "pk",
    "pkg",
    "package",
    "cnt",
    "dozen",
  ])

  for (const alias of aliases) {
    if (hasUnitAlias(rawText, alias)) {
      return true
    }
  }

  return false
}

export function shouldUsePackagedUnitFallback(row: IngredientMatchQueueRow): boolean {
  if (row.source !== "scraper") return false
  return !hasExplicitUnitSignals(row)
}

function hasPackagedItemSignals(row: IngredientMatchQueueRow): boolean {
  const raw = normalizeSpaces(
    `${row.raw_unit || ""} ${row.cleaned_name || ""} ${row.raw_product_name || ""}`.toLowerCase()
  )
  if (!raw) return false
  return PACKAGED_ITEM_SIGNAL_PATTERN.test(raw)
}

export function shouldUsePackagedUnitFallbackAfterFailure(
  row: IngredientMatchQueueRow,
  unitResult?: UnitStandardizationResult
): boolean {
  if (row.source !== "scraper") return false
  if (unitResult?.status === "success") return false
  if (shouldUsePackagedUnitFallback(row)) return true
  return hasPackagedItemSignals(row)
}

export function buildPackagedUnitFallback(rowId: string): UnitStandardizationResult {
  return {
    id: rowId,
    resolvedUnit: "unit",
    resolvedQuantity: 1,
    confidence: UNIT_FALLBACK_CONFIDENCE,
    status: "success",
  }
}

export function isPackagedUnitFallbackResult(
  _row: IngredientMatchQueueRow,
  unitResult: UnitStandardizationResult | undefined
): boolean {
  if (!unitResult || unitResult.status !== "success") return false
  if (unitResult.resolvedUnit !== "unit" || unitResult.resolvedQuantity !== 1) return false
  return unitResult.confidence <= UNIT_FALLBACK_CONFIDENCE
}

export function collectUnitHints(row: IngredientMatchQueueRow, unitResult?: UnitStandardizationResult): string[] {
  const hints = new Set<string>()
  const addHint = (value?: string | null) => {
    const normalized = normalizeSpaces((value || "").toLowerCase())
    if (!normalized) return

    // Ignore accidental full ingredient lines in raw_unit fallback.
    const tokenCount = normalized.split(" ").length
    if (tokenCount > 3) return
    hints.add(normalized)
  }

  addHint(row.raw_unit)
  addHint(row.resolved_unit)

  if (unitResult?.status === "success" && unitResult.resolvedUnit) {
    const aliases = RESOLVED_UNIT_ALIASES[unitResult.resolvedUnit] || []
    aliases.forEach((alias) => hints.add(alias))
  }

  GENERIC_MEASURE_ALIASES.forEach((alias) => hints.add(alias))

  return Array.from(hints).sort((a, b) => b.length - a.length)
}

export function stripMeasurementFromSearchTerm(
  rawName: string,
  row: IngredientMatchQueueRow,
  unitResult?: UnitStandardizationResult
): string {
  let working = normalizeSpaces(rawName.toLowerCase())
  if (!working) return rawName

  // Collapse repeated leading quantities (e.g. "1 1 glug ...").
  working = working.replace(/^(\d+(?:\.\d+)?)\s+\1(?=\s)/, "$1")

  const unitHints = collectUnitHints(row, unitResult)
  const hintedUnitsPattern = unitHints.length
    ? `(?:${unitHints.map((hint) => escapeRegExp(hint).replace(/\s+/g, "[\\s.-]*")).join("|")})`
    : ""

  const quantityPattern = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)"
  const leadingQtyUnitPattern = hintedUnitsPattern
    ? new RegExp(`^${quantityPattern}\\s*[-x*]?\\s*${hintedUnitsPattern}\\b\\s*`, "i")
    : null
  const leadingCompactPattern = hintedUnitsPattern
    ? new RegExp(`^${quantityPattern}${hintedUnitsPattern}\\b\\s*`, "i")
    : null
  const leadingQtyOnlyPattern = new RegExp(`^${quantityPattern}\\s+`, "i")
  const trailingUnitPattern = hintedUnitsPattern ? new RegExp(`\\s+${hintedUnitsPattern}$`, "i") : null
  const trailingQtyOnlyPattern = new RegExp(`\\s+${quantityPattern}$`, "i")

  for (let i = 0; i < 4; i += 1) {
    const before = working

    if (leadingQtyUnitPattern) {
      working = working.replace(leadingQtyUnitPattern, "")
    }
    if (leadingCompactPattern) {
      working = working.replace(leadingCompactPattern, "")
    }
    working = working.replace(leadingQtyOnlyPattern, "")

    if (trailingUnitPattern) {
      working = working.replace(trailingUnitPattern, "")
    }
    working = working.replace(trailingQtyOnlyPattern, "")

    working = normalizeSpaces(working)
    if (working === before) break
  }

  return working || rawName
}
