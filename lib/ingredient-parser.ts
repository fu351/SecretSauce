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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse free-form recipe text — handles both structured ingredient lists AND
 * instruction-style prose.
 *
 * Pipeline per line:
 *   1. Skip section headers ("For the sauce:", "INGREDIENTS", "# ...")
 *   2. Strip step/list markers ("Step 3:", "1.", "-", "•")
 *   3. Split on sentence boundaries (". " and "; ") without touching decimals
 *   4. For each sentence:
 *      a. Structured parse (parseIngredientLine) — works for ingredient-list lines
 *      b. Embedded scan — extracts qty+unit patterns from instruction prose
 *      c. Name-only fallback — kept only if the sentence is not a pure instruction
 *
 * Duplicate rows (same qty/unit/name) are suppressed.
 * Used by the "Paste Ingredients" UI tab via POST /api/ingredients/parse.
 */
export function parseRecipeText(
  text: string,
  unitKeys: string[]
): ParsedIngredientRow[] {
  if (!unitKeys.length) {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => ({ quantity: null, unit: null, name: line, raw: line }))
  }

  const unitAlt = buildUnitAlt(unitKeys)
  const results: ParsedIngredientRow[] = []
  const seen = new Set<string>()

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (!line || isSectionHeader(line)) continue

    // Strip step markers ("Step 3:", "1. ", "- ", etc.) and standalone step numbers
    const stripped = stripAllMarkers(line)
    if (!stripped || /^\d+$/.test(stripped)) continue // bare step numbers ("2", "3")

    for (const sentence of splitSentences(stripped)) {
      if (!sentence) continue

      // ── (a) Structured ingredient-line parse ──────────────────────────────
      const row = parseIngredientLine(sentence, unitKeys)
      if (row.quantity !== null || row.unit !== null) {
        dedupeAdd(results, seen, { ...row, raw: rawLine })
        continue
      }

      // ── (b) Embedded scan for qty+unit inside instruction prose ───────────
      const embedded = scanEmbedded(sentence, unitAlt, rawLine)
      if (embedded.length > 0) {
        for (const e of embedded) dedupeAdd(results, seen, e)
        continue
      }

      // ── (c) Name-only fallback — skip pure instruction sentences ──────────
      if (!isInstruction(sentence)) {
        dedupeAdd(results, seen, row)
      }
    }
  }

  return results
}

/**
 * Parse a structured multi-line ingredient block (numbered list, bullet list).
 * Blank lines, # comment lines, and section headers are skipped.
 * For free-form prose / instruction-style input, use parseRecipeText instead.
 */
export function parseIngredientParagraph(
  text: string,
  unitKeys: string[]
): ParsedIngredientRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .filter((line) => !isSectionHeader(line))
    .map((line) => parseIngredientLine(line, unitKeys))
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
  const unitAlt = buildUnitAlt(unitKeys)

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

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * A line is a section header (skip it) if it:
 *   - starts with #: "# Dry ingredients"
 *   - ends with a colon and has no leading digit: "For the sauce:", "Marinade:"
 *   - is ALL CAPS with no digits and 3+ chars: "INGREDIENTS", "WET INGREDIENTS"
 */
function isSectionHeader(line: string): boolean {
  if (line.startsWith("#")) return true
  if (/^[^:\d][^:]*:\s*$/.test(line)) return true
  if (/^[A-Z][A-Z\s]{2,}$/.test(line) && !/\d/.test(line)) return true
  return false
}

/** Strip step markers and list markers from the front of a line. */
function stripAllMarkers(line: string): string {
  return line
    .replace(/^step\s+\d+[.:)]\s*/i, "") // "Step 3:" / "Step 3."
    .replace(/^[\d]+[.)]\s+/, "")         // "1. " / "2) "
    .replace(/^[-*•]\s*/, "")             // "- " / "* " / "• "
    .trim()
}

/**
 * Split a line into sentences on ". " and "; " without splitting decimal
 * points (e.g. "1.5 cups" stays intact).
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<!\d)\.[ \t]+(?!\d)|;[ \t]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Heuristic: is this a cooking instruction rather than an ingredient?
 *
 * - Long sentences (> 60 chars) with no qty/unit are almost certainly instructions.
 * - Sentences starting with a known instruction verb are instructions.
 *
 * Short sentences beginning with instruction verbs are intentionally kept
 * if they're under 60 chars — "salt to taste" passes even though "to" appears
 * in some instruction contexts. The length guard handles ambiguous short starters.
 */
const INSTRUCTION_VERBS =
  /^(?:add|stir|mix|heat|preheat|cook|bake|pour|place|put|remove|set|prepare|slice|dice|chop|combine|whisk|fold|reduce|bring|simmer|boil|melt|fry|sauté|saute|transfer|repeat|let|serve|top|garnish|drizzle|spread|dredge|squeeze|scrape|shake|starting|working)\b/i

function isInstruction(s: string): boolean {
  if (s.length > 60) return true
  if (INSTRUCTION_VERBS.test(s)) return true
  return false
}

/**
 * Scan an instruction sentence for embedded qty+unit patterns.
 * Extracts ingredient fragments found anywhere within the sentence.
 *
 * @example
 *   "Add 2 tablespoons butter and 1 tablespoon oil, and let it melt."
 *   → [{ qty: 2, unit: "tablespoons", name: "butter" },
 *      { qty: 1, unit: "tablespoon",  name: "oil" }]
 *
 * Name capture stops at comma/semicolon/period, or when "and <digit>" signals
 * another quantity is starting. Trailing "and <digit>..." is trimmed from names.
 */
function scanEmbedded(
  sentence: string,
  unitAlt: string,
  raw: string
): ParsedIngredientRow[] {
  const results: ParsedIngredientRow[] = []
  const seen = new Set<string>()

  // Trim trailing "and <digit>..." so "butter and 1 tablespoon oil" → name "butter"
  const trimName = (s: string): string =>
    s.replace(/\s+and\s+\d.*$/i, "").trim()

  // Three patterns, most-specific first to avoid partial overlaps.
  // Name group: everything up to comma/semicolon/period/newline (greedy).
  const patterns: Array<{ re: RegExp; extract(m: RegExpExecArray): ParsedIngredientRow | null }> = [
    {
      // Mixed fraction: "1 1/2 cups milk" anywhere in the sentence
      re: new RegExp(
        `\\b(\\d+)\\s+(\\d+)\\s*\\/\\s*(\\d+)\\s+(${unitAlt})\\s+([^,;.\\n]+)`,
        "gi"
      ),
      extract(m) {
        if (Number(m[3]) === 0) return null
        const name = trimName(m[5])
        if (!name) return null
        return { quantity: Number(m[1]) + Number(m[2]) / Number(m[3]), unit: normalizeUnit(m[4]), name, raw }
      },
    },
    {
      // Plain fraction: "1/4 cup soy sauce" anywhere in the sentence
      re: new RegExp(
        `\\b(\\d+)\\s*\\/\\s*(\\d+)\\s+(${unitAlt})\\s+([^,;.\\n]+)`,
        "gi"
      ),
      extract(m) {
        if (Number(m[2]) === 0) return null
        const name = trimName(m[4])
        if (!name) return null
        return { quantity: Number(m[1]) / Number(m[2]), unit: normalizeUnit(m[3]), name, raw }
      },
    },
    {
      // Decimal/integer: "2 tablespoons butter" or "500ml water" anywhere
      re: new RegExp(
        `\\b(\\d+\\.?\\d*)\\s*(${unitAlt})\\s+([^,;.\\n]+)`,
        "gi"
      ),
      extract(m) {
        const name = trimName(m[3])
        if (!name) return null
        return { quantity: parseFloat(m[1]), unit: normalizeUnit(m[2]), name, raw }
      },
    },
  ]

  for (const { re, extract } of patterns) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(sentence)) !== null) {
      const row = extract(m)
      if (!row) continue
      const key = `${row.quantity}|${row.unit}|${row.name}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push(row)
      }
    }
  }

  return results
}

/** Add a row only if we haven't seen the same (qty, unit, name) tuple already. */
function dedupeAdd(
  results: ParsedIngredientRow[],
  seen: Set<string>,
  row: ParsedIngredientRow
): void {
  const key = `${row.quantity}|${row.unit}|${row.name}`
  if (!seen.has(key)) {
    seen.add(key)
    results.push(row)
  }
}

/** Build regex alternation from vocab, longest-first, with metachar escaping. */
function buildUnitAlt(vocab: string[]): string {
  return vocab
    .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("|")
}

/** Normalize the matched unit string: trim and lowercase. */
function normalizeUnit(raw: string): string {
  return raw.trim().toLowerCase()
}
