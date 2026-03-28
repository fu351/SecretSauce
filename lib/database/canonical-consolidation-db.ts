import { supabaseWorker as supabase } from "./supabase-worker"
import type { CanonicalDoubleCheckDirection, CanonicalDoubleCheckDailyStatsRow } from "./ingredient-match-queue-db"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface ConsolidateResult {
  success: boolean
  reason?: string
  rowsUpdated: Record<string, number>
}

interface ConsolidationLogParams {
  survivorCanonical: string
  loserCanonical: string
  direction: CanonicalDoubleCheckDirection
  similarity: number | null
  rowsUpdated: Record<string, number>
  workerName?: string
  dryRun?: boolean
}

class CanonicalConsolidationDB {
  async fetchCandidates(params: {
    minSimilarity: number
    minEventCount: number
    limit: number
    offset?: number
  }): Promise<CanonicalDoubleCheckDailyStatsRow[]> {
    const cutoffDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data, error } = await (supabase.from as any)("canonical_double_check_daily_stats")
      .select(
        "event_date,source_canonical,target_canonical,decision,reason,direction,event_count,source_category,target_category,min_confidence,max_confidence,min_similarity,max_similarity"
      )
      .gte("event_date", cutoffDate)
      .gte("event_count", Math.max(1, params.minEventCount))
      .gte("max_similarity", params.minSimilarity)
      .in("direction", ["lateral"])
      .in("decision", ["skipped"])
      .eq("reason", "vector_candidate_discovery")
      .order("max_similarity", { ascending: false })
      .range(params.offset ?? 0, (params.offset ?? 0) + Math.max(1, params.limit) - 1)

    if (error) {
      console.error("[CanonicalConsolidationDB] fetchCandidates error:", error.message)
      return []
    }

    return ((data || []) as CanonicalDoubleCheckDailyStatsRow[]).map((row) => ({
      ...row,
      event_count: Number(row.event_count || 0),
    }))
  }

  async consolidateCanonical(params: {
    survivorCanonical: string
    loserCanonical: string
    dryRun?: boolean
  }): Promise<ConsolidateResult> {
    const { survivorCanonical, loserCanonical, dryRun = false } = params

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_consolidate_canonical`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        p_survivor_canonical: survivorCanonical,
        p_loser_canonical: loserCanonical,
        p_dry_run: dryRun,
      }),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      const msg = (errBody as any)?.message ?? response.statusText
      console.error("[CanonicalConsolidationDB] consolidateCanonical error:", JSON.stringify(errBody))
      return { success: false, reason: msg, rowsUpdated: {} }
    }

    const data = await response.json()

    const result = data as { dry_run?: boolean; skipped?: boolean; reason?: string; rows_updated?: Record<string, number> }

    if (result?.skipped) {
      return { success: false, reason: result.reason ?? "skipped", rowsUpdated: {} }
    }

    return {
      success: true,
      rowsUpdated: result?.rows_updated ?? {},
    }
  }

  async fetchProductCountsByCanonical(canonicals: string[]): Promise<Map<string, number>> {
    if (canonicals.length === 0) return new Map()

    // Step 1: resolve canonical names → standardized_ingredient IDs
    const { data: ingredients, error: ingError } = await (supabase.from as any)(
      "standardized_ingredients"
    )
      .select("id, canonical_name")
      .in("canonical_name", canonicals)

    if (ingError || !ingredients?.length) return new Map()

    const idToCanonical = new Map<string, string>(
      (ingredients as Array<{ id: string; canonical_name: string }>).map((i) => [
        i.id,
        i.canonical_name,
      ])
    )
    const ids = [...idToCanonical.keys()]

    // Step 2: count product_mappings rows per standardized_ingredient_id
    const counts = new Map<string, number>()
    const chunkSize = 50

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      const { data: mappings, error: mapError } = await (supabase.from as any)("product_mappings")
        .select("standardized_ingredient_id")
        .in("standardized_ingredient_id", chunk)

      if (mapError || !mappings) continue

      for (const row of mappings as Array<{ standardized_ingredient_id: string }>) {
        const canonical = idToCanonical.get(row.standardized_ingredient_id)
        if (canonical) counts.set(canonical, (counts.get(canonical) ?? 0) + 1)
      }
    }

    return counts
  }

  async fetchProbationCanonicalsWithoutEmbedding(params: {
    model: string
    limit: number
    minDistinctSources: number
  }): Promise<string[]> {
    // Pull canonical names that have enough distinct sources but no embedding yet.
    // LEFT JOIN against canonical_candidate_embeddings; keep rows where embedding
    // is absent or was made with a different model.
    const { data, error } = await (supabase.from as any)(
      "canonical_creation_probation_events"
    )
      .select("canonical_name")
      .limit(params.limit * 10) // over-fetch to account for already-embedded rows

    if (error || !data?.length) {
      if (error) console.error("[CanonicalConsolidationDB] fetchProbationCanonicalsWithoutEmbedding error:", error.message)
      return []
    }

    // Group by canonical_name to count distinct source_signatures
    const sourceCounts = new Map<string, number>()
    for (const row of data as Array<{ canonical_name: string }>) {
      sourceCounts.set(row.canonical_name, (sourceCounts.get(row.canonical_name) ?? 0) + 1)
    }

    const eligible = [...sourceCounts.entries()]
      .filter(([, count]) => count >= params.minDistinctSources)
      .map(([name]) => name)

    if (!eligible.length) return []

    // Fetch which of these already have an embedding with the right model
    const chunkSize = 200
    const alreadyEmbedded = new Set<string>()

    for (let i = 0; i < eligible.length; i += chunkSize) {
      const chunk = eligible.slice(i, i + chunkSize)
      const { data: existing } = await (supabase.from as any)(
        "canonical_candidate_embeddings"
      )
        .select("canonical_name")
        .in("canonical_name", chunk)
        .eq("embedding_model", params.model)

      for (const row of (existing ?? []) as Array<{ canonical_name: string }>) {
        alreadyEmbedded.add(row.canonical_name)
      }
    }

    return eligible
      .filter((name) => !alreadyEmbedded.has(name))
      .slice(0, params.limit)
  }

  async logConsolidationEvent(params: ConsolidationLogParams): Promise<void> {
    const { error } = await (supabase.from as any)("canonical_consolidation_log").insert({
      survivor_canonical: params.survivorCanonical,
      loser_canonical: params.loserCanonical,
      direction: params.direction,
      similarity: params.similarity,
      dry_run: params.dryRun ?? false,
      rows_updated: params.rowsUpdated,
      worker_name: params.workerName ?? null,
    })

    if (error) {
      throw new Error(`[CanonicalConsolidationDB] logConsolidationEvent error: ${error.message}`)
    }
  }
}

export const canonicalConsolidationDB = new CanonicalConsolidationDB()
