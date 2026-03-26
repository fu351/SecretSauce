import { normalizeCanonicalName } from "../../../backend/scripts/utils/canonical-matching"

export function toCanonicalTokens(value: string): string[] {
  return normalizeCanonicalName(value).split(" ").filter(Boolean)
}
