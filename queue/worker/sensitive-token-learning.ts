import {
  ingredientMatchQueueDB,
  type CanonicalDoubleCheckDailyStatsRow,
} from "../../lib/database/ingredient-match-queue-db"
import { singularizeCanonicalName } from "../../scripts/utils/canonical-matching"

const DRIFT_LOOKBACK_DAYS = 30
const DRIFT_REFRESH_MS = 10 * 60 * 1000
const DRIFT_MAX_ROWS = 5000
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

let cachedSensitivity: LearnedVarietySensitivity = EMPTY_SENSITIVITY
let inflightLoad: Promise<LearnedVarietySensitivity> | null = null

function canonicalTokens(value: string): string[] {
  return singularizeCanonicalName(value)
    .split(" ")
    .filter(Boolean)
}

function toPairKey(row: CanonicalDoubleCheckDailyStatsRow): string {
  return `${row.source_canonical} -> ${row.target_canonical}`
}

function buildSensitivity(rows: CanonicalDoubleCheckDailyStatsRow[]): LearnedVarietySensitivity {
  const modifierWeightByHead = new Map<string, Map<string, number>>()
  const modifierPairsByHead = new Map<string, Map<string, Set<string>>>()
  const totalWeightByHead = new Map<string, number>()

  for (const row of rows) {
    if (row.direction !== "specific_to_generic") continue

    const sourceTokens = canonicalTokens(row.source_canonical)
    const targetTokens = canonicalTokens(row.target_canonical)
    if (!sourceTokens.length || !targetTokens.length) continue

    const head = targetTokens[targetTokens.length - 1]
    if (!head) continue

    const targetTokenSet = new Set(targetTokens)
    const droppedTokens = sourceTokens.filter((token) => token.length >= 3 && !targetTokenSet.has(token))
    if (!droppedTokens.length) continue

    const weight = Math.max(1, Number(row.event_count || 0))
    totalWeightByHead.set(head, (totalWeightByHead.get(head) || 0) + weight)

    let modifierWeights = modifierWeightByHead.get(head)
    if (!modifierWeights) {
      modifierWeights = new Map<string, number>()
      modifierWeightByHead.set(head, modifierWeights)
    }

    let modifierPairs = modifierPairsByHead.get(head)
    if (!modifierPairs) {
      modifierPairs = new Map<string, Set<string>>()
      modifierPairsByHead.set(head, modifierPairs)
    }

    const pairKey = toPairKey(row)
    for (const token of droppedTokens) {
      modifierWeights.set(token, (modifierWeights.get(token) || 0) + weight)
      let pairSet = modifierPairs.get(token)
      if (!pairSet) {
        pairSet = new Set<string>()
        modifierPairs.set(token, pairSet)
      }
      pairSet.add(pairKey)
    }
  }

  const sensitiveHeads = new Set<string>()
  const modifiersByHead = new Map<string, ReadonlySet<string>>()

  for (const [head, modifierWeights] of modifierWeightByHead.entries()) {
    const headTotalWeight = totalWeightByHead.get(head) || 0
    if (headTotalWeight <= 0) continue

    const selectedModifiers = new Set<string>()
    const modifierPairs = modifierPairsByHead.get(head) || new Map<string, Set<string>>()

    for (const [modifier, weight] of modifierWeights.entries()) {
      const pairCount = modifierPairs.get(modifier)?.size || 0
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
  const rows = await ingredientMatchQueueDB.fetchCanonicalDoubleCheckDailyStats({
    daysBack: DRIFT_LOOKBACK_DAYS,
    directions: ["specific_to_generic"],
    decisions: ["remapped", "skipped"],
    minEventCount: 1,
    limit: DRIFT_MAX_ROWS,
  })

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

export async function getLearnedVarietySensitivity(forceRefresh = false): Promise<LearnedVarietySensitivity> {
  const now = Date.now()
  if (!forceRefresh && cachedSensitivity.loadedAt > 0 && now - cachedSensitivity.loadedAt < DRIFT_REFRESH_MS) {
    return cachedSensitivity
  }

  if (inflightLoad) {
    return inflightLoad
  }

  inflightLoad = loadSensitivityFromDrift()
    .then((learned) => {
      cachedSensitivity = learned
      return learned
    })
    .catch((error) => {
      console.warn("[QueueResolver] Failed to learn sensitivity tokens from drift telemetry:", error)
      return cachedSensitivity
    })
    .finally(() => {
      inflightLoad = null
    })

  return inflightLoad
}
