export const STRICT_JSON_RESPONSE_RULE = "Return ONLY valid JSON. Do not add markdown, comments, or explanation."

export function stringifyPromptList(values: string[], limit = 200, fallback = "No values provided"): string {
  if (!values.length) return fallback
  return values.slice(0, limit).join(", ")
}

export function formatPromptInputJson<T>(items: T[]): string {
  return JSON.stringify(items, null, 2)
}
