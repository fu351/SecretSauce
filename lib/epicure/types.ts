/**
 * Shared types for the Epicure ingredient-embedding integration.
 *
 * These mirror the JSON shapes returned by the python-api `/epicure/*`
 * endpoints (see python-api/epicure_api.py).
 */

declare const _tokenBrand: unique symbol
/**
 * An Epicure vocabulary token (lowercase, accent-stripped, snake_case).
 *
 * Branded so the compiler can't confuse a token with a human-readable display
 * name. The only sanctioned constructor is {@link toToken}/`asToken` in
 * ./token-utils — never cast a raw string to `EpicureToken` elsewhere.
 */
export type EpicureToken = string & { readonly [_tokenBrand]: true }

declare const _cosineBrand: unique symbol
/** A single-model cosine similarity in [-1, 1] (from /neighbors, /cuisine-blend). */
export type CosineSimilarity = number & { readonly [_cosineBrand]: true }

declare const _blendBrand: unique symbol
/** A blended/weighted swap score (from /swap); a sum across models, can exceed 1. */
export type BlendScore = number & { readonly [_blendBrand]: true }

/** Any Epicure score. Branded so a cosine value and a blended value can't be silently mixed. */
export type EpicureScore = CosineSimilarity | BlendScore

/** The Epicure models. Mirrors `ModelName` in python-api/epicure_api.py. */
export type EpicureModelName = "core" | "chem" | "cooc"

export interface SwapSuggestion {
  /** Human-readable ingredient name (e.g. "chicken broth"). */
  ingredient: string
  /** Epicure vocabulary token (e.g. "chicken_broth"). */
  token: EpicureToken
  /** Blended or cosine similarity score; higher is closer. Always finite. */
  score: EpicureScore
  /** Which models contributed to a blended swap score, when applicable. */
  sources?: EpicureModelName[]
}

export interface SwapRankOptions {
  /** Tokens to drop from the results (allergens, owned pantry items, etc.). */
  excludeTokens?: string[]
  /** Minimum score to keep. */
  minScore?: number
  /** Maximum number of suggestions to return. */
  limit?: number
}

export interface CuisineBlendParams {
  ingredient: string
  cuisine: string
  thetaDeg?: number
  k?: number
  model?: EpicureModelName
}
