import { ingredientMatchQueueDB } from "../../lib/database/ingredient-match-queue-db"
import { canonicalConsolidationDB } from "../../lib/database/canonical-consolidation-db"

import type { CanonicalConsolidationWorkerConfig } from "./config"
import { assessConsolidationCandidate } from "./guards"
import { selectSurvivor } from "./survivor"

export interface CanonicalConsolidationRunSummary {
  cycles: number
  totalConsidered: number
  totalConsolidated: number
  totalSkipped: number
  totalFailed: number
}

interface CycleResult {
  considered: number
  consolidated: number
  skipped: number
  failed: number
}

async function runCycle(config: CanonicalConsolidationWorkerConfig): Promise<CycleResult> {
  const filtered = await canonicalConsolidationDB.fetchCandidates({
    minSimilarity: config.minSimilarity,
    minEventCount: config.minEventCount,
    limit: config.batchLimit,
  })

  if (!filtered.length) {
    console.log("[CanonicalConsolidation] No candidates meet the threshold")
    return { considered: 0, consolidated: 0, skipped: 0, failed: 0 }
  }

  console.log(`[CanonicalConsolidation] ${filtered.length} candidate(s) to consider`)

  let consolidated = 0
  let skipped = 0
  let failed = 0

  for (const row of filtered) {
    const assessment = assessConsolidationCandidate(row)

    if (!assessment.allowed) {
      console.log(
        `[CanonicalConsolidation] Skipped ${row.source_canonical} -> ${row.target_canonical}: ${assessment.reason}`
      )
      skipped++
      continue
    }

    const { survivorCanonical, loserCanonical } = selectSurvivor(row)

    if (config.dryRun) {
      console.log(
        `[CanonicalConsolidation] [DRY RUN] ${loserCanonical} -> ${survivorCanonical} ` +
          `(similarity=${row.max_similarity?.toFixed(4)}, direction=${row.direction}, rule=${assessment.reason})`
      )
      skipped++
      continue
    }

    try {
      const result = await canonicalConsolidationDB.consolidateCanonical({
        survivorCanonical,
        loserCanonical,
      })

      if (!result.success) {
        console.warn(
          `[CanonicalConsolidation] Skipped ${loserCanonical} -> ${survivorCanonical}: ${result.reason ?? "unknown"}`
        )
        skipped++
        continue
      }

      await canonicalConsolidationDB.logConsolidationEvent({
        survivorCanonical,
        loserCanonical,
        direction: row.direction,
        similarity: row.max_similarity ?? null,
        rowsUpdated: result.rowsUpdated,
        workerName: config.workerName,
      })

      // Mark the stats row as remapped
      await ingredientMatchQueueDB.logCanonicalDoubleCheckDaily({
        sourceCanonical: row.source_canonical,
        targetCanonical: row.target_canonical,
        decision: "remapped",
        reason: "vector_candidate_discovery",
        direction: row.direction,
        similarity: row.max_similarity ?? null,
        sourceCategory: row.source_category,
        targetCategory: row.target_category,
      })

      console.log(
        `[CanonicalConsolidation] Merged ${loserCanonical} -> ${survivorCanonical} ` +
          `(similarity=${row.max_similarity?.toFixed(4)}, direction=${row.direction})`
      )
      consolidated++
    } catch (error) {
      console.error(
        `[CanonicalConsolidation] Failed ${loserCanonical} -> ${survivorCanonical}:`,
        error
      )
      failed++
    }
  }

  return { considered: filtered.length, consolidated, skipped, failed }
}

export async function runCanonicalConsolidation(
  config: CanonicalConsolidationWorkerConfig
): Promise<CanonicalConsolidationRunSummary> {
  const maxCycles = config.maxCycles > 0 ? config.maxCycles : Infinity
  let cycles = 0
  let totalConsidered = 0
  let totalConsolidated = 0
  let totalSkipped = 0
  let totalFailed = 0

  while (cycles < maxCycles) {
    const result = await runCycle(config)
    cycles++
    totalConsidered += result.considered
    totalConsolidated += result.consolidated
    totalSkipped += result.skipped
    totalFailed += result.failed

    if (result.considered < config.batchLimit) break
  }

  console.log(
    `[CanonicalConsolidation] Done. cycles=${cycles} considered=${totalConsidered} ` +
      `consolidated=${totalConsolidated} skipped=${totalSkipped} failed=${totalFailed}`
  )

  return { cycles, totalConsidered, totalConsolidated, totalSkipped, totalFailed }
}
