import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function fetchUnitKeywords(): Promise<string[]> {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data, error } = await (client as any).rpc("fn_get_recipe_parser_unit_keywords")
  if (error) throw error
  return ((data ?? []) as Array<{ keyword: string }>).map((r) => r.keyword)
}

// In-process cache — matches the 1hr TTL in lib/database/unit-standardization-db.ts.
// Unit vocab changes at most nightly when the scraper queue worker resolves new unit strings.
let cached: string[] | null = null
let expiry = 0
const TTL = 60 * 60 * 1000

export async function getWorkerUnitKeywords(): Promise<string[]> {
  if (cached && Date.now() < expiry) return cached
  cached = await fetchUnitKeywords()
  expiry = Date.now() + TTL
  return cached
}
