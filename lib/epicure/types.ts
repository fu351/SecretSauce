/**
 * Shared types for the Epicure ingredient-embedding integration.
 *
 * These mirror the JSON shapes returned by the python-api `/epicure/*`
 * endpoints (see python-api/epicure_api.py).
 */

export interface SwapSuggestion {
  /** Human-readable ingredient name (e.g. "chicken broth"). */
  ingredient: string
  /** Epicure vocabulary token (e.g. "chicken_broth"). */
  token: string
  /** Blended/cosine similarity score; higher is closer. */
  score: number
  /** Which models contributed to a blended swap score, when applicable. */
  sources?: string[]
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
  model?: string
}
