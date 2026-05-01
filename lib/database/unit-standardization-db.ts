import "server-only"

import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

/**
 * Returns unit keyword strings for the TypeScript ingredient parser.
 *
 * Calls fn_get_recipe_parser_unit_keywords() via RPC. All filtering
 * (confidence threshold, standard_unit check, product-name exclusion) is
 * handled in SQL. Results arrive sorted longest-first so the caller can
 * build a greedy regex alternation directly.
 *
 * Uses a controlled `any` boundary because the RPC return type is not
 * present in the generated Supabase TypeScript schema. The narrow cast is
 * intentional and safe: the function returns a single `keyword text` column.
 */
export async function getUnitKeywords(): Promise<string[]> {
  const supabase = createServiceSupabaseClient() as unknown as {
    rpc: (name: string, args: Record<string, never>) => Promise<{
      data: Array<{ keyword: string }> | null
      error: unknown | null
    }>
  }
  const { data, error } = await supabase.rpc("fn_get_recipe_parser_unit_keywords", {})

  if (error) throw error

  return ((data ?? []) as Array<{ keyword: string }>).map((r) => r.keyword)
}

// Simple in-process cache — unit vocab changes at most nightly when the
// scraper queue worker adds rows to unit_standardization_map.
let cachedKeywords: string[] | null = null
let cacheExpiry = 0
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Cached version of getUnitKeywords(). Returns the same array within the
 * TTL window; refetches after expiry. Safe for use in API route handlers.
 */
export async function getUnitKeywordsCached(): Promise<string[]> {
  if (cachedKeywords && Date.now() < cacheExpiry) return cachedKeywords
  cachedKeywords = await getUnitKeywords()
  cacheExpiry = Date.now() + CACHE_TTL_MS
  return cachedKeywords
}
