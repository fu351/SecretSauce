import type { EpicureToken } from "./types"

/**
 * Normalize an ingredient name to its Epicure-style token.
 *
 * Must stay in lockstep with python-api/epicure_names.to_token (lowercase,
 * accent-stripped, snake_case, punctuation removed) — cross-layer token
 * matching is the core correctness invariant of the Epicure integration.
 *
 * This is the single sanctioned constructor of {@link EpicureToken}: it brands
 * its result so the rest of the codebase can't fabricate tokens from raw
 * strings. Idempotent — re-normalizing an already-normalized token is a no-op.
 */
export function toToken(name: string): EpicureToken {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_") as EpicureToken
}

/**
 * Brand a value that is already an Epicure token (e.g. one returned by the
 * python service) without re-normalizing. Convenience alias over {@link toToken}
 * for readability at trust boundaries; both produce the same idempotent result.
 */
export function asToken(value: string): EpicureToken {
  return toToken(value)
}
