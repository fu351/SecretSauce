export function normalizeConfidence(value: number | null | undefined, fallback = 0.5): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return fallback
  return value
}
