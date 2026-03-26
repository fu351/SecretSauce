import {
  ingredientMatchQueueDB,
  type SensitivityPairStatsRow,
} from "../../../lib/database/ingredient-match-queue-db"
import { singularizeCanonicalName } from "../../../backend/scripts/utils/canonical-matching"
import { makeRefreshingCache } from "../cache/refreshing-cache"

const DRIFT_REFRESH_MS = 10 * 60 * 1000
const MIN_TOKEN_EVENT_COUNT = 3
const MIN_TOKEN_DISTINCT_PAIRS = 2
const STRONG_TOKEN_EVENT_COUNT = 8
const MIN_TOKEN_RELATIVE_WEIGHT = 0.08

export interface LearnedVarietySensitivity {
  loadedAt: number
  sourceRows: number
  sensitiveHeads: ReadonlySet<string>
  modifiersByHead: ReadonlyMap<string, ReadonlySet<string>>
}

const EMPTY_SENSITIVITY: LearnedVarietySensitivity = {
  loadedAt: 0,
  sourceRows: 0,
  sensitiveHeads: new Set<string>(),
  modifiersByHead: new Map<string, ReadonlySet<string>>(),
}

function canonicalTokens(value: string): string[] {
  return singularizeCanonicalName(value)
    .split(" ")
    .filter(Boolean)
}

function buildSensitivity(rows: SensitivityPairStatsRow[]): LearnedVarietySensitivity {
  const modifierWeightByHead = new Map<string, Map<string, number>>()
  const modifierPairCountByHead = new Map<string, Map<string, number>>()
  const totalWeightByHead = new Map<string, number>()

  for (const row of rows) {
    const sourceTokens = canonicalTokens(row.source_canonical)
    const targetTokens = canonicalTokens(row.target_canonical)
    if (!sourceTokens.length || !targetTokens.length) continue

    const head = targetTokens[targetTokens.length - 1]
    if (!head) continue

    const targetTokenSet = new Set(targetTokens)
    const droppedTokens = sourceTokens.filter((token) => token.length >= 3 && !targetTokenSet.has(token))
    if (!droppedTokens.length) continue

    // Each row is already a unique (source, target) pair — total_events is the summed weight.
    const weight = Math.max(1, Number(row.total_events || 0))
    totalWeightByHead.set(head, (totalWeightByHead.get(head) || 0) + weight)

    let modifierWeights = modifierWeightByHead.get(head)
    if (!modifierWeights) {
      modifierWeights = new Map<string, number>()
      modifierWeightByHead.set(head, modifierWeights)
    }

    let modifierPairCounts = modifierPairCountByHead.get(head)
    if (!modifierPairCounts) {
      modifierPairCounts = new Map<string, number>()
      modifierPairCountByHead.set(head, modifierPairCounts)
    }

    for (const token of droppedTokens) {
      modifierWeights.set(token, (modifierWeights.get(token) || 0) + weight)
      // Each input row is one unique (source, target) pair, so increment by 1.
      modifierPairCounts.set(token, (modifierPairCounts.get(token) || 0) + 1)
    }
  }

  const sensitiveHeads = new Set<string>()
  const modifiersByHead = new Map<string, ReadonlySet<string>>()

  for (const [head, modifierWeights] of modifierWeightByHead.entries()) {
    const headTotalWeight = totalWeightByHead.get(head) || 0
    if (headTotalWeight <= 0) continue

    const selectedModifiers = new Set<string>()
    const modifierPairCounts = modifierPairCountByHead.get(head) || new Map<string, number>()

    for (const [modifier, weight] of modifierWeights.entries()) {
      const pairCount = modifierPairCounts.get(modifier) || 0
      const relativeWeight = weight / headTotalWeight
      const isFrequentAndDistributed =
        weight >= MIN_TOKEN_EVENT_COUNT &&
        pairCount >= MIN_TOKEN_DISTINCT_PAIRS &&
        relativeWeight >= MIN_TOKEN_RELATIVE_WEIGHT
      const isStrongSignal = weight >= STRONG_TOKEN_EVENT_COUNT

      if (isFrequentAndDistributed || isStrongSignal) {
        selectedModifiers.add(modifier)
      }
    }

    if (selectedModifiers.size) {
      sensitiveHeads.add(head)
      modifiersByHead.set(head, selectedModifiers)
    }
  }

  return {
    loadedAt: Date.now(),
    sourceRows: rows.length,
    sensitiveHeads,
    modifiersByHead,
  }
}

async function loadSensitivityFromDrift(): Promise<LearnedVarietySensitivity> {
  const rows = await ingredientMatchQueueDB.fetchSensitivityPairStats({ minEventCount: 1 })

  const learned = buildSensitivity(rows)
  const totalModifiers = Array.from(learned.modifiersByHead.values()).reduce(
    (sum, modifiers) => sum + modifiers.size,
    0
  )
  console.log(
    `[QueueResolver] Learned variety sensitivity from drift: heads=${learned.sensitiveHeads.size}, modifiers=${totalModifiers}, rows=${learned.sourceRows}`
  )
  return learned
}

const sensitivityCache = makeRefreshingCache({
  refreshIntervalMs: DRIFT_REFRESH_MS,
  fallback: EMPTY_SENSITIVITY,
  load: loadSensitivityFromDrift,
  onError: (error) =>
    console.warn("[QueueResolver] Failed to learn sensitivity tokens from drift telemetry:", error),
})

export async function getLearnedVarietySensitivity(forceRefresh = false): Promise<LearnedVarietySensitivity> {
  return sensitivityCache.get(forceRefresh)
}
