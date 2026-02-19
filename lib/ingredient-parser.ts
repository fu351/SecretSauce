export interface ParsedIngredientRow {
  /** Numeric quantity, or null if none detected. SQL defaults null to 1. */
  quantity: number | null
  /**
   * Raw unit string as typed, not yet canonicalized.
   * The SQL fn_standardize_unit_lookup will map this to a unit_label enum value.
   * null means no unit keyword was detected.
   */
  unit: string | null
  /** Trimmed ingredient name — everything after quantity and unit. */
  name: string
  /** The original unmodified input line, for display in the preview table. */
  raw: string
}

/**
 * Parse a single ingredient line into {quantity, unit, name}.
 *
 * @param line     - One ingredient line of text.
 * @param unitKeys - Unit keyword strings from unit_standardization_map,
 *                   sorted longest-first. Fetch via getUnitKeywordsCached().
 *
 * Extraction order mirrors fn_parse_unit_from_text in SQL (Priorities 2+3).
 * Priority 1 (rawUnit scraper param) is not applicable to recipe text.
 *
 *   Pass 1: decimal/integer + known unit keyword
 *   Pass 2: mixed fraction (N W/D) + known unit keyword
 *   Pass 3: plain fraction (N/D) + known unit keyword
 *   Pass 4: decimal/integer with no unit → each fallback
 *   Pass 5: no quantity detected → name only
 *
 * Canonical ingredient matching is NOT done here — that is SQL's responsibility
 * via fn_resolve_ingredient / fn_match_ingredient.
 */
export function parseIngredientLine(
  line: string,
  unitKeys: string[]
): ParsedIngredientRow {
  const raw = line

  // Strip leading list markers: "1. ", "2) ", "- ", "* ", "• "
  // \s+ (not \s*) is intentional: a decimal like "1.5" must not be stripped.
  let trimmed = line.trim().replace(/^[\d]+[.)]\s+|^[-*•]\s*/, "")
  trimmed = trimmed.trim()
  if (!trimmed) return { quantity: null, unit: null, name: "", raw }

  // Build unit alternation from live vocabulary.
  // unitKeys is already sorted longest-first by the DB helper, so the
  // first match wins greedily — "tablespoons" matches before "tsp", etc.
  // Regex-escape each keyword and allow flexible whitespace inside
  // multi-word entries ("fl oz" → "fl\s+oz").
  const unitAlt = unitKeys
    .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("|")

  if (!unitAlt) {
    // No unit vocabulary available — return name-only row
    return { quantity: null, unit: null, name: trimmed, raw }
  }

  const U = `(?:${unitAlt})`

  // ── Pass 1: decimal/integer + known unit keyword ───────────────────────────
  // Mirrors SQL Priority 3c: decimal/integer qty + unit from product name text.
  // \s* between number and unit allows no-space: "500ml water", "2cups flour".
  let m = trimmed.match(new RegExp(`^(\\d+\\.?\\d*)\\s*(${U})\\s+(.+)$`, "i"))
  if (m) {
    return { quantity: parseFloat(m[1]), unit: normalizeUnit(m[2]), name: m[3].trim(), raw }
  }

  // ── Pass 2: mixed fraction + known unit keyword ────────────────────────────
  // Mirrors SQL Priority 3b: N W/D unit in product name text.
  // e.g. "1 1/2 cups milk", "2 3/4 oz cheese"
  m = trimmed.match(new RegExp(`^(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)\\s+(${U})\\s+(.+)$`, "i"))
  if (m && Number(m[3]) !== 0) {
    return {
      quantity: Number(m[1]) + Number(m[2]) / Number(m[3]),
      unit: normalizeUnit(m[4]),
      name: m[5].trim(),
      raw,
    }
  }

  // ── Pass 3: plain fraction + known unit keyword ────────────────────────────
  // Mirrors SQL Priority 2c: fraction fallback from the legacy unit field.
  // e.g. "3/4 tsp salt", "1/3 cup sugar"
  m = trimmed.match(new RegExp(`^(\\d+)\\s*/\\s*(\\d+)\\s+(${U})\\s+(.+)$`, "i"))
  if (m && Number(m[2]) !== 0) {
    return {
      quantity: Number(m[1]) / Number(m[2]),
      unit: normalizeUnit(m[3]),
      name: m[4].trim(),
      raw,
    }
  }

  // ── Pass 4: decimal/integer, no recognized unit → each fallback ───────────
  // Mirrors SQL Priority 3d/3e: leading number + word or explicit each/ea.
  // "2 eggs" → qty 2, unit "each", name "eggs"
  // "1 onion, diced" → qty 1, unit "each", name "onion, diced"
  m = trimmed.match(/^(\d+\.?\d*)\s+(.+)$/)
  if (m) {
    // Guard: don't fire if the "name" part starts with a fraction (N/D).
    // That would be a mis-parse of "1 1/2 cups" if Pass 2 somehow failed.
    if (!/^\d+\s*\/\s*\d+/.test(m[2])) {
      return { quantity: parseFloat(m[1]), unit: "each", name: m[2].trim(), raw }
    }
  }

  // ── Pass 5: no quantity detected ──────────────────────────────────────────
  // "salt to taste", "fresh parsley for garnish", "pepper"
  return { quantity: null, unit: null, name: trimmed, raw }
}

/**
 * Parse a multi-line ingredient block (paragraph or numbered list).
 * Blank lines and comment-only lines (starting with #) are skipped.
 */
export function parseIngredientParagraph(
  text: string,
  unitKeys: string[]
): ParsedIngredientRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => parseIngredientLine(line, unitKeys))
}

/** Normalize the matched unit string: trim and lowercase. */
function normalizeUnit(raw: string): string {
  return raw.trim().toLowerCase()
}
