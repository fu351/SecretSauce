/**
 * Vector Double-Check Candidate Discovery (Phase 4)
 *
 * Periodically scans for canonical pairs with high cosine similarity that
 * have never appeared in canonical_double_check_daily_stats. Each discovered
 * pair is logged via fn_log_canonical_double_check_daily with
 * reason='vector_candidate_discovery' so it surfaces in the review pipeline.
 *
 * See docs/queue-and-standardization.md (Vector double-check candidate discovery).
 */

import { ingredientEmbeddingsDB } from "../../../lib/database/ingredient-embeddings-db"
import { ingredientMatchQueueDB } from "../../../lib/database/ingredient-match-queue-db"
import { resolveRemapDirection } from "../ingredient-worker/canonical/double-check"
import type { VectorDoubleCheckWorkerConfig } from "./config"

export interface VectorDoubleCheckRunSummary {
  cycles: number
  totalDiscovered: number
  totalLogged: number
  totalSkipped: number
}

interface CycleResult {
  discovered: number
  logged: number
  skipped: number
}

async function runCycle(config: VectorDoubleCheckWorkerConfig): Promise<CycleResult> {
  const candidates = await ingredientEmbeddingsDB.findDoubleCheckCandidates({
    threshold: config.similarityThreshold,
    limit: config.batchLimit,
    model: config.embeddingModel,
  })

  if (!candidates.length) {
    console.log("[VectorDoubleCheck] No new candidates found above threshold", config.similarityThreshold)
    return { discovered: 0, logged: 0, skipped: 0 }
  }

  console.log(`[VectorDoubleCheck] Discovered ${candidates.length} new candidate pair(s)`)

  if (config.dryRun) {
    for (const c of candidates) {
      const direction = resolveRemapDirection(c.source_canonical, c.target_canonical)
      console.log(
        `[VectorDoubleCheck] [DRY RUN] ${c.source_canonical} → ${c.target_canonical} ` +
          `(similarity=${c.similarity.toFixed(4)}, direction=${direction})`
      )
    }
    return { discovered: candidates.length, logged: 0, skipped: candidates.length }
  }

  let logged = 0
  let skipped = 0

  for (const candidate of candidates) {
    const direction = resolveRemapDirection(candidate.source_canonical, candidate.target_canonical)

    if (direction === "generic_to_specific") {
      // Log to stats so the NOT EXISTS check excludes this pair in future runs
      const ok = await ingredientMatchQueueDB.logCanonicalDoubleCheckDaily({
        sourceCanonical: candidate.source_canonical,
        targetCanonical: candidate.target_canonical,
        decision: "skipped",
        reason: "vector_candidate_discovery",
        direction,
        similarity: candidate.similarity,
        sourceCategory: candidate.source_category,
        targetCategory: candidate.target_category,
      })
      if (!ok) {
        throw new Error(
          `[VectorDoubleCheck] Failed to log ${candidate.source_canonical} → ${candidate.target_canonical}`
        )
      }
      skipped++
      continue
    }

    // For lateral pairs, always put the shorter name as source
    const sourceCanonical =
      direction === "lateral" && candidate.target_canonical.length < candidate.source_canonical.length
        ? candidate.target_canonical
        : candidate.source_canonical
    const targetCanonical =
      direction === "lateral" && candidate.target_canonical.length < candidate.source_canonical.length
        ? candidate.source_canonical
        : candidate.target_canonical

    const ok = await ingredientMatchQueueDB.logCanonicalDoubleCheckDaily({
      sourceCanonical,
      targetCanonical,
      decision: "skipped",
      reason: "vector_candidate_discovery",
      direction,
      aiConfidence: null,
      similarity: candidate.similarity,
      sourceCategory: candidate.source_category,
      targetCategory: candidate.target_category,
    })

    if (ok) {
      logged++
      console.log(
        `[VectorDoubleCheck] Logged ${sourceCanonical} → ${targetCanonical} ` +
          `(similarity=${candidate.similarity.toFixed(4)}, direction=${direction})`
      )
    } else {
      throw new Error(`[VectorDoubleCheck] Failed to log ${sourceCanonical} → ${targetCanonical}`)
    }
  }

  return { discovered: candidates.length, logged, skipped }
}

export async function runVectorDoubleCheckDiscovery(
  config: VectorDoubleCheckWorkerConfig
): Promise<VectorDoubleCheckRunSummary> {
  const maxCycles = config.maxCycles > 0 ? config.maxCycles : Infinity
  let cycles = 0
  let totalDiscovered = 0
  let totalLogged = 0
  let totalSkipped = 0

  while (cycles < maxCycles) {
    const result = await runCycle(config)
    cycles++
    totalDiscovered += result.discovered
    totalLogged += result.logged
    totalSkipped += result.skipped

    // Stop when fewer candidates than the batch limit — backlog is clear.
    // Skipped pairs are now written to the stats table, so the next cycle
    // will always return different candidates (no infinite loop risk).
    if (result.discovered < config.batchLimit) break
  }

  console.log(
    `[VectorDoubleCheck] Done. cycles=${cycles} discovered=${totalDiscovered} ` +
      `logged=${totalLogged} skipped=${totalSkipped}`
  )

  return { cycles, totalDiscovered, totalLogged, totalSkipped }
}
