/**
 * Normalize an ingredient name to its Epicure-style token.
 *
 * Must stay in lockstep with python-api/epicure_names.to_token (lowercase,
 * accent-stripped, snake_case, punctuation removed) — cross-layer token
 * matching is the core correctness invariant of the Epicure integration.
 */
export function toToken(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_")
}
