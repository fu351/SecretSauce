export function normalizeZipCode(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  const fiveDigitMatch = trimmed.match(/\b\d{5}(?:-\d{4})?\b/)
  if (fiveDigitMatch) return fiveDigitMatch[0].slice(0, 5)
  if (/^\d{5}$/.test(trimmed)) return trimmed
  return undefined
}
