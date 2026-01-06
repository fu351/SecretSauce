/**
 * Shared utility functions for ingredient processing.
 * These are in a separate file to avoid circular dependencies between
 * ingredient-pipeline.ts and ingredient-standardizer.ts
 */

/**
 * Normalizes a canonical ingredient name for consistent storage/lookup.
 * - Converts to lowercase
 * - Replaces hyphens with spaces
 * - Collapses multiple spaces into single space
 * - Trims whitespace
 *
 * Examples:
 *   "All-Purpose Flour" → "all purpose flour"
 *   "all-purpose  flour" → "all purpose flour"
 *   "Chicken Breast" → "chicken breast"
 */
export function normalizeCanonicalName(name: string): string {
  if (!name) return ""
  return name
    .toLowerCase()
    .replace(/-/g, " ")           // hyphens → spaces
    .replace(/\s+/g, " ")         // collapse multiple spaces
    .trim()
}
