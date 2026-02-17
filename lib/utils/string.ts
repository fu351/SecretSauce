export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}
