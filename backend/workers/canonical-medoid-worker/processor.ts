import { canonicalConsolidationDB } from "../../../lib/database/canonical-consolidation-db"
import {
  canonicalMedoidDB,
  type CanonicalMedoidMembershipInsert,
  type CanonicalMedoidMembershipHistoryRow,
} from "../../../lib/database/canonical-medoid-db"
import type { CanonicalDoubleCheckDailyStatsRow } from "../../../lib/database/ingredient-match-queue-db"
import {
  buildCanonicalClusterCommunities,
  pairKey,
} from "../canonical-consolidation-worker/cluster"
import type { CanonicalMedoidWorkerConfig } from "./config"
import { toCanonicalTokens } from "../ingredient-worker/canonical/tokens"

interface MemberScore {
  canonicalName: string
  score: number
  avgSimilarity: number
  tokenPurity: number
  productCount: number
}

interface SelectedCommunityMedoid {
  medoidCanonical: string
  selectionReason: string
  previousMedoidCanonical: string | null
  members: MemberScore[]
}

export interface CanonicalMedoidRunSummary {
  cycles: number
  totalCandidates: number
  totalClusters: number
  totalAssignments: number
  totalRunsCreated: number
  mode: CanonicalMedoidWorkerConfig["mode"]
  snapshotMonth: string
}

function normalizeSnapshotMonth(value?: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01`
}

async function fetchAllCandidates(
  config: CanonicalMedoidWorkerConfig
): Promise<{ rows: CanonicalDoubleCheckDailyStatsRow[]; cycles: number }> {
  const rows: CanonicalDoubleCheckDailyStatsRow[] = []
  const maxCycles = config.maxCycles > 0 ? config.maxCycles : Infinity
  let offset = 0
  let cycles = 0

  while (cycles < maxCycles) {
    const batch = await canonicalConsolidationDB.fetchCandidates({
      minSimilarity: config.minSimilarity,
      minEventCount: config.minEventCount,
      limit: config.batchLimit,
      offset,
    })

    cycles += 1
    if (!batch.length) break

    rows.push(...batch)
    if (batch.length < config.batchLimit) break
    offset += config.batchLimit
  }

  return { rows, cycles }
}

function buildSimilarityByPair(rows: CanonicalDoubleCheckDailyStatsRow[]): Map<string, number> {
  const similarityByPair = new Map<string, number>()
  for (const row of rows) {
    const key = pairKey(row.source_canonical, row.target_canonical)
    similarityByPair.set(key, Math.max(similarityByPair.get(key) ?? 0, row.max_similarity ?? 0))
  }
  return similarityByPair
}

function averageSimilarityForMember(
  canonicalName: string,
  members: string[],
  similarityByPair: Map<string, number>
): number {
  if (members.length <= 1) return 0

  let sum = 0
  let comparisons = 0
  for (const other of members) {
    if (other === canonicalName) continue
    sum += similarityByPair.get(pairKey(canonicalName, other)) ?? 0
    comparisons += 1
  }

  return comparisons > 0 ? sum / comparisons : 0
}

function computeTokenPurity(canonicalName: string, commonTokens: string[]): number {
  const tokens = new Set(toCanonicalTokens(canonicalName))
  if (!tokens.size) return 0

  const overlap = commonTokens.filter((token) => tokens.has(token)).length
  return overlap / tokens.size
}

function computeMedoidScore(avgSimilarity: number, tokenPurity: number, productCount: number): number {
  const productWeight = Math.min(1, Math.log1p(productCount) / Math.log(101))
  return avgSimilarity * 0.7 + tokenPurity * 0.2 + productWeight * 0.1
}

function compareMemberScores(left: MemberScore, right: MemberScore): number {
  if (left.score !== right.score) return left.score > right.score ? 1 : -1
  if (left.avgSimilarity !== right.avgSimilarity) return left.avgSimilarity > right.avgSimilarity ? 1 : -1
  if (left.tokenPurity !== right.tokenPurity) return left.tokenPurity > right.tokenPurity ? 1 : -1
  if (left.productCount !== right.productCount) return left.productCount > right.productCount ? 1 : -1
  if (left.canonicalName.length !== right.canonicalName.length) {
    return left.canonicalName.length < right.canonicalName.length ? 1 : -1
  }
  return left.canonicalName.localeCompare(right.canonicalName) < 0 ? 1 : -1
}

function pickPreviousMedoid(
  members: string[],
  previousByCanonical: Map<string, CanonicalMedoidMembershipHistoryRow>
): string | null {
  const memberSet = new Set(members)
  const counts = new Map<string, number>()

  for (const member of members) {
    const previous = previousByCanonical.get(member)
    if (!previous) continue
    if (!memberSet.has(previous.medoidCanonical)) continue
    counts.set(previous.medoidCanonical, (counts.get(previous.medoidCanonical) ?? 0) + 1)
  }

  let best: string | null = null
  let bestCount = -1
  for (const [canonicalName, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && canonicalName < best)) {
      best = canonicalName
      bestCount = count
    }
  }

  return best
}

function selectCommunityMedoid(params: {
  members: string[]
  commonTokens: string[]
  similarityByPair: Map<string, number>
  productCounts: Map<string, number>
  previousByCanonical: Map<string, CanonicalMedoidMembershipHistoryRow>
  config: CanonicalMedoidWorkerConfig
}): SelectedCommunityMedoid {
  const scoredMembers = params.members
    .map((canonicalName) => {
      const avgSimilarity = averageSimilarityForMember(canonicalName, params.members, params.similarityByPair)
      const tokenPurity = computeTokenPurity(canonicalName, params.commonTokens)
      const productCount = params.productCounts.get(canonicalName) ?? 0

      return {
        canonicalName,
        avgSimilarity,
        tokenPurity,
        productCount,
        score: computeMedoidScore(avgSimilarity, tokenPurity, productCount),
      }
    })
    .sort((a, b) => compareMemberScores(b, a))

  const bestCandidate = scoredMembers[0]
  const previousMedoidCanonical =
    params.config.mode === "perturbation" ? pickPreviousMedoid(params.members, params.previousByCanonical) : null

  if (!previousMedoidCanonical) {
    return {
      medoidCanonical: bestCandidate.canonicalName,
      selectionReason:
        params.config.mode === "initiation" ? "initiation_best_score" : "perturbation_fallback_to_initiation",
      previousMedoidCanonical: null,
      members: scoredMembers,
    }
  }

  const previousMember = scoredMembers.find((member) => member.canonicalName === previousMedoidCanonical)
  if (!previousMember) {
    return {
      medoidCanonical: bestCandidate.canonicalName,
      selectionReason: "perturbation_missing_previous_medoid",
      previousMedoidCanonical,
      members: scoredMembers,
    }
  }

  if (
    bestCandidate.canonicalName !== previousMedoidCanonical &&
    bestCandidate.score >= previousMember.score + params.config.stabilityDelta
  ) {
    return {
      medoidCanonical: bestCandidate.canonicalName,
      selectionReason: "perturbation_promoted_better_candidate",
      previousMedoidCanonical,
      members: scoredMembers,
    }
  }

  return {
    medoidCanonical: previousMedoidCanonical,
    selectionReason: "perturbation_retained_previous_medoid",
    previousMedoidCanonical,
    members: scoredMembers,
  }
}

export async function runCanonicalMedoidWorker(
  config: CanonicalMedoidWorkerConfig
): Promise<CanonicalMedoidRunSummary> {
  const snapshotMonth = normalizeSnapshotMonth(config.snapshotMonth)
  const { rows, cycles } = await fetchAllCandidates(config)
  const communities = buildCanonicalClusterCommunities(rows)

  console.log(
    `[CanonicalMedoidWorker] Loaded ${rows.length} candidate pair(s) and ${communities.length} cluster(s) ` +
      `(mode=${config.mode}, snapshot_month=${snapshotMonth})`
  )

  const allCanonicals = Array.from(new Set(communities.flatMap((community) => community.members)))
  const [productCounts, previousByCanonical] = await Promise.all([
    canonicalConsolidationDB.fetchProductCountsByCanonical(allCanonicals),
    config.mode === "perturbation"
      ? canonicalMedoidDB.fetchLatestMembershipsForCanonicals(allCanonicals)
      : Promise.resolve(new Map<string, CanonicalMedoidMembershipHistoryRow>()),
  ])

  const similarityByPair = buildSimilarityByPair(rows)
  const memberships: CanonicalMedoidMembershipInsert[] = []

  communities.forEach((community, index) => {
    const selection = selectCommunityMedoid({
      members: community.members,
      commonTokens: community.commonTokens,
      similarityByPair,
      productCounts,
      previousByCanonical,
      config,
    })

    console.log(
      `[CanonicalMedoidWorker] Cluster ${index + 1}: medoid=${selection.medoidCanonical} ` +
        `(members=${community.members.length}, reason=${selection.selectionReason})`
    )

    const clusterKey = community.members.join("|")
    for (const member of selection.members) {
      memberships.push({
        runId: "",
        snapshotMonth,
        clusterIndex: index + 1,
        clusterKey,
        canonicalName: member.canonicalName,
        medoidCanonical: selection.medoidCanonical,
        isMedoid: member.canonicalName === selection.medoidCanonical,
        selectionMode: config.mode,
        selectionReason: selection.selectionReason,
        score: Number(member.score.toFixed(6)),
        avgSimilarity: Number(member.avgSimilarity.toFixed(6)),
        tokenPurity: Number(member.tokenPurity.toFixed(6)),
        productCount: member.productCount,
        clusterSize: community.clusterSize,
        previousMedoidCanonical: selection.previousMedoidCanonical,
      })
    }
  })

  let totalRunsCreated = 0
  if (!config.dryRun) {
    const runId = await canonicalMedoidDB.createRun({
      snapshotMonth,
      mode: config.mode,
      workerName: config.workerName,
      dryRun: false,
      similarityThreshold: config.minSimilarity,
      minEventCount: config.minEventCount,
      stabilityDelta: config.stabilityDelta,
      candidatePairCount: rows.length,
      clusterCount: communities.length,
      assignmentCount: memberships.length,
    })
    memberships.forEach((membership) => {
      membership.runId = runId
    })
    await canonicalMedoidDB.insertMemberships(memberships)
    totalRunsCreated = 1
  } else {
    console.log("[CanonicalMedoidWorker] [DRY RUN] Skipping medoid snapshot write")
  }

  return {
    cycles,
    totalCandidates: rows.length,
    totalClusters: communities.length,
    totalAssignments: memberships.length,
    totalRunsCreated,
    mode: config.mode,
    snapshotMonth,
  }
}
