import { supabaseWorker as supabase } from "./supabase-worker"
import type { CanonicalDoubleCheckDirection, CanonicalDoubleCheckDailyStatsRow } from "./ingredient-match-queue-db"

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
  }): Promise<CanonicalDoubleCheckDailyStatsRow[]> {
    const cutoffDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data, error } = await (supabase.from as any)("canonical_double_check_daily_stats")
      .select(
        "event_date,source_canonical,target_canonical,decision,reason,direction,event_count,source_category,target_category,min_confidence,max_confidence,min_similarity,max_similarity"
      )
      .gte("event_date", cutoffDate)
      .gte("event_count", Math.max(1, params.minEventCount))
      .gte("max_similarity", params.minSimilarity)
      .in("direction", ["lateral", "specific_to_generic"])
      .in("decision", ["skipped"])
      .eq("reason", "vector_candidate_discovery")
      .order("max_similarity", { ascending: false })
      .limit(Math.max(1, params.limit))

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

    const { data, error } = await (supabase.rpc as any)("fn_consolidate_canonical", {
      p_survivor_canonical: survivorCanonical,
      p_loser_canonical: loserCanonical,
      p_dry_run: dryRun,
    })

    if (error) {
      console.error("[CanonicalConsolidationDB] consolidateCanonical error:", error.message)
      return { success: false, reason: error.message, rowsUpdated: {} }
    }

    const result = data as { dry_run?: boolean; skipped?: boolean; reason?: string; rows_updated?: Record<string, number> }

    if (result?.skipped) {
      return { success: false, reason: result.reason ?? "skipped", rowsUpdated: {} }
    }

    return {
      success: true,
      rowsUpdated: result?.rows_updated ?? {},
    }
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
      console.error("[CanonicalConsolidationDB] logConsolidationEvent error:", error.message)
    }
  }
}

export const canonicalConsolidationDB = new CanonicalConsolidationDB()
