/**
 * Regex-based extraction of prep/cook/total times from raw recipe text.
 * All returned values are in minutes.
 */

export interface ExtractedTimes {
  prep_time?: number
  cook_time?: number
  total_time?: number
}

// Matches hours: "1 hour", "2 hrs", "1h", "1.5 hours"
const HOUR_RE = /(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?/i
// Matches minutes: "30 minutes", "30 mins", "30 min", "30 m"
// Requires a digit before the "m" so it won't fire on bare words like "medium"
const MIN_RE = /(\d+)\s*m(?:inutes?|ins?)?(?!\w)/i

function parseDuration(text: string): number | undefined {
  const hourMatch = text.match(HOUR_RE)
  const minMatch = text.match(MIN_RE)

  if (!hourMatch && !minMatch) return undefined

  const hours = hourMatch ? parseFloat(hourMatch[1]) : 0
  const mins = minMatch ? parseInt(minMatch[1]) : 0
  const total = Math.round(hours * 60) + mins

  return total > 0 ? total : undefined
}

// Each entry: a label pattern and the field it maps to.
// Order matters — evaluate prep before cook before total.
const TIME_LABELS: Array<{ re: RegExp; field: keyof ExtractedTimes }> = [
  // "Prep time:", "Preparation time:", "Prep:"
  { re: /prep(?:aration)?\s*(?:time)?\s*[:\-–]/i, field: "prep_time" },
  // "Cook time:", "Cooking time:", "Cook:"
  { re: /cook(?:ing)?\s*(?:time)?\s*[:\-–]/i, field: "cook_time" },
  // "Total time:", "Total:", "Ready in:", "Ready in"
  { re: /(?:total\s*(?:time)?|ready\s+in)\s*[:\-–]?/i, field: "total_time" },
]

/**
 * Scan every line of the raw recipe text and extract labeled time values.
 * Returns only the fields that were found; undetected fields are omitted.
 */
export function extractTimes(text: string): ExtractedTimes {
  const result: ExtractedTimes = {}
  const lines = text.replace(/\r\n/g, "\n").split("\n")

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    for (const { re, field } of TIME_LABELS) {
      if (result[field] !== undefined) continue // already found this field

      const labelMatch = line.match(re)
      if (!labelMatch) continue

      const afterLabel = line.slice(labelMatch.index! + labelMatch[0].length)
      const minutes = parseDuration(afterLabel)
      if (minutes !== undefined) {
        result[field] = minutes
      }
    }

    // Stop scanning once all three fields are found
    if (
      result.prep_time !== undefined &&
      result.cook_time !== undefined &&
      result.total_time !== undefined
    ) break
  }

  return result
}
