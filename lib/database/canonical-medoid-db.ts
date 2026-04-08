import { supabaseWorker as supabase } from "./supabase-worker"

export interface CanonicalMedoidRunInsert {
  snapshotMonth: string
  mode: "initiation" | "perturbation"
  workerName: string
  dryRun: boolean
  similarityThreshold: number
  minEventCount: number
  stabilityDelta: number
  candidatePairCount: number
  clusterCount: number
  assignmentCount: number
}

export interface CanonicalMedoidMembershipInsert {
  runId: string
  snapshotMonth: string
  clusterIndex: number
  clusterKey: string
  canonicalName: string
  medoidCanonical: string
  isMedoid: boolean
  selectionMode: "initiation" | "perturbation"
  selectionReason: string
  score: number
  avgSimilarity: number
  tokenPurity: number
  productCount: number
  clusterSize: number
  previousMedoidCanonical: string | null
}

export interface CanonicalMedoidMembershipHistoryRow {
  canonicalName: string
  medoidCanonical: string
  snapshotMonth: string
  selectionMode: "initiation" | "perturbation"
  previousMedoidCanonical: string | null
}

class CanonicalMedoidDB {
  async createRun(params: CanonicalMedoidRunInsert): Promise<string> {
    const { data, error } = await (supabase.from as any)("canonical_medoid_runs")
      .insert({
        snapshot_month: params.snapshotMonth,
        mode: params.mode,
        worker_name: params.workerName,
        dry_run: params.dryRun,
        similarity_threshold: params.similarityThreshold,
        min_event_count: params.minEventCount,
        stability_delta: params.stabilityDelta,
        candidate_pair_count: params.candidatePairCount,
        cluster_count: params.clusterCount,
        assignment_count: params.assignmentCount,
      })
      .select("id")
      .single()

    if (error || !data?.id) {
      throw new Error(`[CanonicalMedoidDB] createRun error: ${error?.message ?? "missing run id"}`)
    }

    return data.id as string
  }

  async insertMemberships(rows: CanonicalMedoidMembershipInsert[]): Promise<void> {
    if (!rows.length) return

    const { error } = await (supabase.from as any)("canonical_medoid_memberships").insert(
      rows.map((row) => ({
        run_id: row.runId,
        snapshot_month: row.snapshotMonth,
        cluster_index: row.clusterIndex,
        cluster_key: row.clusterKey,
        canonical_name: row.canonicalName,
        medoid_canonical: row.medoidCanonical,
        is_medoid: row.isMedoid,
        selection_mode: row.selectionMode,
        selection_reason: row.selectionReason,
        score: row.score,
        avg_similarity: row.avgSimilarity,
        token_purity: row.tokenPurity,
        product_count: row.productCount,
        cluster_size: row.clusterSize,
        previous_medoid_canonical: row.previousMedoidCanonical,
      }))
    )

    if (error) {
      throw new Error(`[CanonicalMedoidDB] insertMemberships error: ${error.message}`)
    }
  }

  async fetchLatestMembershipsForCanonicals(
    canonicals: string[]
  ): Promise<Map<string, CanonicalMedoidMembershipHistoryRow>> {
    if (!canonicals.length) return new Map()

    const rows: Array<{
      canonical_name: string
      medoid_canonical: string
      snapshot_month: string
      selection_mode: "initiation" | "perturbation"
      previous_medoid_canonical: string | null
      created_at: string
    }> = []

    const chunkSize = 200
    for (let i = 0; i < canonicals.length; i += chunkSize) {
      const chunk = canonicals.slice(i, i + chunkSize)
      const { data, error } = await (supabase.from as any)("canonical_medoid_memberships")
        .select(
          "canonical_name, medoid_canonical, snapshot_month, selection_mode, previous_medoid_canonical, created_at"
        )
        .in("canonical_name", chunk)
        .order("snapshot_month", { ascending: false })
        .order("created_at", { ascending: false })

      if (error) {
        throw new Error(`[CanonicalMedoidDB] fetchLatestMembershipsForCanonicals error: ${error.message}`)
      }

      rows.push(...((data ?? []) as typeof rows))
    }

    const latestByCanonical = new Map<string, CanonicalMedoidMembershipHistoryRow>()
    for (const row of rows) {
      if (latestByCanonical.has(row.canonical_name)) continue
      latestByCanonical.set(row.canonical_name, {
        canonicalName: row.canonical_name,
        medoidCanonical: row.medoid_canonical,
        snapshotMonth: row.snapshot_month,
        selectionMode: row.selection_mode,
        previousMedoidCanonical: row.previous_medoid_canonical,
      })
    }

    return latestByCanonical
  }
}

export const canonicalMedoidDB = new CanonicalMedoidDB()
