function normalizeWhitespace(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ")
}

function isEmptyUnit(value: string): boolean {
  return /^(?:n\/a|na|none|null|undefined)?$/i.test(value)
}

/**
 * Mirrors scripts/utils/daily-scraper-utils.js extractUnitHint logic.
 * Priority: unit/size/package_size/unit_size, then pricePerUnit suffix parsing.
 */
export function extractUnitHintFromDailyScraper(result: {
  unit?: unknown
  size?: unknown
  package_size?: unknown
  unit_size?: unknown
  pricePerUnit?: unknown
  price_per_unit?: unknown
}): string {
  const directCandidates = [
    result?.unit,
    result?.size,
    result?.package_size,
    result?.unit_size,
  ]

  for (const candidate of directCandidates) {
    const normalized = normalizeWhitespace(candidate)
    if (!normalized) continue
    if (isEmptyUnit(normalized)) continue
    return normalized
  }

  const pricePerUnit = normalizeWhitespace(
    result?.pricePerUnit || result?.price_per_unit || "",
  )
  if (!pricePerUnit) return ""

  const suffixMatch = pricePerUnit.match(/\/\s*([a-z][a-z.\s]{0,20})$/i)
  return suffixMatch ? normalizeWhitespace(suffixMatch[1]).toLowerCase() : ""
}

/**
 * Preserve explicit scraper rawUnit first, then defer to daily-scraper extractUnitHint.
 */
export function resolveRawUnitWithDailyScraperPriority(result: {
  rawUnit?: unknown
  raw_unit?: unknown
  unit?: unknown
  size?: unknown
  package_size?: unknown
  unit_size?: unknown
  pricePerUnit?: unknown
  price_per_unit?: unknown
}): string | null {
  const explicitRawUnit = normalizeWhitespace(result?.rawUnit || result?.raw_unit || "")
  if (explicitRawUnit && !isEmptyUnit(explicitRawUnit)) {
    return explicitRawUnit
  }

  const hintedUnit = extractUnitHintFromDailyScraper(result)
  return hintedUnit || null
}
