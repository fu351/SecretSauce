import {
  ingredientMatchQueueDB,
  type CanonicalDoubleCheckDailyStatsRow,
} from "../../../lib/database/ingredient-match-queue-db"
import { canonicalConsolidationDB } from "../../../lib/database/canonical-consolidation-db"

import type { CanonicalConsolidationWorkerConfig } from "./config"
import { assessConsolidationCandidate } from "./guards"
import type { WeightedHeuristicContext } from "./guards"
import { buildClusterConsolidationProposals, pairKey } from "./cluster"
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

interface ConsolidationIntent {
  row: CanonicalDoubleCheckDailyStatsRow
  survivorCanonical?: string
  loserCanonical?: string
  forcedReason?: string
}

interface ConsolidationPlan {
  intents: ConsolidationIntent[]
  superseded: number
}

function buildConsolidationIntents(
  rows: CanonicalDoubleCheckDailyStatsRow[],
  productCounts: Map<string, number>,
  config: CanonicalConsolidationWorkerConfig
): ConsolidationPlan {
  if (!config.enableClusterPlanning) {
    return { intents: rows.map((row) => ({ row })), superseded: 0 }
  }

  const intents: ConsolidationIntent[] = []
  let superseded = 0
  const clusterProposals = buildClusterConsolidationProposals(rows, productCounts)
  const proposalByPair = new Map(clusterProposals.map((proposal) => [
    pairKey(proposal.fromCanonical, proposal.toCanonical),
    proposal,
  ]))
  const clusteredMembers = new Set(
    clusterProposals.flatMap((proposal) => proposal.clusterMembers)
  )

  for (const row of rows) {
    const key = pairKey(row.source_canonical, row.target_canonical)
    const proposal = proposalByPair.get(key)
    if (proposal) {
      intents.push({
        row,
        survivorCanonical: proposal.toCanonical,
        loserCanonical: proposal.fromCanonical,
        forcedReason: `cluster_token_core_match:${proposal.commonTokens.join("|")}`,
      })
      continue
    }

    if (
      row.direction === "lateral" &&
      (clusteredMembers.has(row.source_canonical) || clusteredMembers.has(row.target_canonical))
    ) {
      console.log(
        `[CanonicalConsolidation] Skipped ${row.source_canonical} -> ${row.target_canonical}: ` +
          `cluster_superseded_by_target_plan`
      )
      superseded++
      continue
    }

    intents.push({ row })
  }

  return { intents, superseded }
}

async function runCycle(config: CanonicalConsolidationWorkerConfig, offset: number): Promise<CycleResult> {
  const filtered = await canonicalConsolidationDB.fetchCandidates({
    minSimilarity: config.minSimilarity,
    minEventCount: config.minEventCount,
    limit: config.batchLimit,
    offset,
  })

  if (!filtered.length) {
    console.log("[CanonicalConsolidation] No candidates meet the threshold")
    return { considered: 0, consolidated: 0, skipped: 0, failed: 0 }
  }

  console.log(`[CanonicalConsolidation] ${filtered.length} candidate(s) to consider`)

  // Fetch product counts for all canonicals in this batch in one pass so both
  // the guard and survivor selection can use the weighted heuristic.
  const batchCanonicals = Array.from(
    new Set(filtered.flatMap((r) => [r.source_canonical, r.target_canonical]))
  )
  const productCounts = await canonicalConsolidationDB.fetchProductCountsByCanonical(batchCanonicals)

  const weightedContext: WeightedHeuristicContext = {
    productCounts,
    weightedSimilarityThreshold: config.weightedSimilarityThreshold,
    minWeightedProductCount: config.minWeightedProductCount,
  }

  let consolidated = 0
  let skipped = 0
  let failed = 0

  const plan = buildConsolidationIntents(filtered, productCounts, config)
  skipped += plan.superseded

  for (const intent of plan.intents) {
    const row = intent.row
    const assessment = intent.forcedReason
      ? { allowed: true, reason: intent.forcedReason }
      : assessConsolidationCandidate(row, weightedContext)

    if (!assessment.allowed) {
      console.log(
        `[CanonicalConsolidation] Skipped ${row.source_canonical} -> ${row.target_canonical}: ${assessment.reason}`
      )
      skipped++
      continue
    }

    const { survivorCanonical, loserCanonical } =
      intent.survivorCanonical && intent.loserCanonical
        ? {
          survivorCanonical: intent.survivorCanonical,
          loserCanonical: intent.loserCanonical,
        }
        : selectSurvivor(row, productCounts)

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
    const result = await runCycle(config, totalConsidered)
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
