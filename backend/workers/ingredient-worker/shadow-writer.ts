import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { standardizedIngredientsDB } from "../../../lib/database/standardized-ingredients-db"

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("[shadow-writer] Missing Supabase credentials")
  _supabase = createClient(url, key)
  return _supabase
}

export interface ShadowComparisonPayload {
  inputKey: string
  sourceName: string
  primaryProvider: string
  shadowProvider: string
  primaryCanonical: string
  shadowCanonical: string | undefined
  primaryConfidence: number
  shadowConfidence: number | undefined
  shadowStartedAt: number
  primaryLatencyMs: number
  canonicalAgreement: boolean
  categoryAgreement: boolean
  shadowError?: string | null
  queueRowId?: string | null
}

function truncateShadowError(error: string | null | undefined): string | null {
  if (!error) return null
  return error.length > 1000 ? error.slice(0, 1000) : error
}

export async function writeShadowComparison(payload: ShadowComparisonPayload): Promise<void> {
  try {
    const shadowLatencyMs = Date.now() - payload.shadowStartedAt

    let shadowCanonicalExists: boolean | null = null
    if (payload.shadowCanonical && !payload.shadowError) {
      const existing = await standardizedIngredientsDB.findByCanonicalName(payload.shadowCanonical)
      shadowCanonicalExists = existing !== null
    }

    const { error } = await getSupabase()
      .from("ingredient_shadow_comparisons")
      .insert({
        queue_row_id: payload.queueRowId ?? null,
        input_key: payload.inputKey,
        source_name: payload.sourceName,
        primary_provider: payload.primaryProvider,
        shadow_provider: payload.shadowProvider,
        primary_canonical: payload.primaryCanonical,
        shadow_canonical: payload.shadowCanonical ?? null,
        primary_confidence: payload.primaryConfidence,
        shadow_confidence: payload.shadowConfidence ?? null,
        canonical_agreement: payload.canonicalAgreement,
        category_agreement: payload.categoryAgreement,
        shadow_canonical_exists: shadowCanonicalExists,
        shadow_latency_ms: shadowLatencyMs,
        shadow_error: truncateShadowError(payload.shadowError),
      })

    if (error) {
      process.stderr.write(`[shadow-writer] Insert failed: ${error.message}\n`)
    }
  } catch (err) {
    process.stderr.write(`[shadow-writer] ${err instanceof Error ? err.message : String(err)}\n`)
  }
}
