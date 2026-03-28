import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CanonicalDoubleCheckDailyStatsRow } from "../../../../lib/database/ingredient-match-queue-db"
import type { CanonicalConsolidationWorkerConfig } from "../config"
import { runCanonicalConsolidation } from "../processor"

const {
  mockFetchCandidates,
  mockFetchProductCountsByCanonical,
  mockConsolidateCanonical,
  mockLogConsolidationEvent,
  mockLogCanonicalDoubleCheckDaily,
} = vi.hoisted(() => ({
  mockFetchCandidates: vi.fn(),
  mockFetchProductCountsByCanonical: vi.fn(),
  mockConsolidateCanonical: vi.fn(),
  mockLogConsolidationEvent: vi.fn(),
  mockLogCanonicalDoubleCheckDaily: vi.fn(),
}))

vi.mock("@/lib/database/canonical-consolidation-db", () => ({
  canonicalConsolidationDB: {
    fetchCandidates: mockFetchCandidates,
    fetchProductCountsByCanonical: mockFetchProductCountsByCanonical,
    consolidateCanonical: mockConsolidateCanonical,
    logConsolidationEvent: mockLogConsolidationEvent,
  },
}))

vi.mock("@/lib/database/ingredient-match-queue-db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database/ingredient-match-queue-db")>(
    "@/lib/database/ingredient-match-queue-db"
  )

  return {
    ...actual,
    ingredientMatchQueueDB: {
      logCanonicalDoubleCheckDaily: mockLogCanonicalDoubleCheckDaily,
    },
  }
})

function buildRow(
  sourceCanonical: string,
  targetCanonical: string,
  overrides: Partial<CanonicalDoubleCheckDailyStatsRow> = {}
): CanonicalDoubleCheckDailyStatsRow {
  return {
    event_date: "2026-03-27",
    source_canonical: sourceCanonical,
    target_canonical: targetCanonical,
    decision: "skipped",
    reason: "vector_candidate_discovery",
    direction: "lateral",
    event_count: 2,
    source_category: "baking",
    target_category: "baking",
    min_confidence: null,
    max_confidence: null,
    min_similarity: 0.98,
    max_similarity: 0.98,
    ...overrides,
  }
}

const baseConfig: CanonicalConsolidationWorkerConfig = {
  batchLimit: 10,
  maxCycles: 0,
  workerIntervalSeconds: 86400,
  minSimilarity: 0.92,
  minEventCount: 2,
  dryRun: false,
  workerName: "test-worker",
  weightedSimilarityThreshold: 0.97,
  minWeightedProductCount: 5,
  enableClusterPlanning: true,
}

describe("runCanonicalConsolidation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})

    mockFetchCandidates.mockResolvedValue([])
    mockFetchProductCountsByCanonical.mockResolvedValue(new Map())
    mockConsolidateCanonical.mockResolvedValue({ success: true, rowsUpdated: { product_mappings: 3 } })
    mockLogConsolidationEvent.mockResolvedValue(undefined)
    mockLogCanonicalDoubleCheckDaily.mockResolvedValue(true)
  })

  it("keeps cluster-planned rows behind the normal safety guards", async () => {
    const rows = [
      buildRow("brown sugar", "sugar", {
        source_category: "baking",
        target_category: "spices",
      }),
      buildRow("brown sugar", "vanilla sugar", {
        source_category: "baking",
        target_category: "spices",
      }),
      buildRow("vanilla sugar", "sugar", {
        source_category: "spices",
        target_category: "baking",
      }),
    ]

    mockFetchCandidates.mockResolvedValueOnce(rows)
    mockFetchProductCountsByCanonical.mockResolvedValueOnce(
      new Map<string, number>([
        ["brown sugar", 8],
        ["sugar", 20],
        ["vanilla sugar", 3],
      ])
    )

    const summary = await runCanonicalConsolidation(baseConfig)

    expect(summary).toEqual({
      cycles: 1,
      totalConsidered: 3,
      totalConsolidated: 0,
      totalSkipped: 3,
      totalFailed: 0,
    })
    expect(mockConsolidateCanonical).not.toHaveBeenCalled()
  })

  it("treats audit-log insert failures as failed merges", async () => {
    mockFetchCandidates.mockResolvedValueOnce([
      buildRow("wontons", "wonton"),
    ])
    mockFetchProductCountsByCanonical.mockResolvedValueOnce(
      new Map<string, number>([
        ["wonton", 5],
        ["wontons", 2],
      ])
    )
    mockLogConsolidationEvent.mockRejectedValueOnce(new Error("log insert failed"))

    const summary = await runCanonicalConsolidation({
      ...baseConfig,
      enableClusterPlanning: false,
    })

    expect(summary).toEqual({
      cycles: 1,
      totalConsidered: 1,
      totalConsolidated: 0,
      totalSkipped: 0,
      totalFailed: 1,
    })
    expect(mockConsolidateCanonical).toHaveBeenCalledTimes(1)
    expect(mockLogCanonicalDoubleCheckDaily).not.toHaveBeenCalled()
  })
})
