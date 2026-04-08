import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CanonicalDoubleCheckDailyStatsRow } from "../../../../lib/database/ingredient-match-queue-db"
import type { CanonicalMedoidMembershipHistoryRow } from "../../../../lib/database/canonical-medoid-db"
import type { CanonicalMedoidWorkerConfig } from "../config"
import { runCanonicalMedoidWorker } from "../processor"

const {
  mockFetchCandidates,
  mockFetchProductCountsByCanonical,
  mockCreateRun,
  mockInsertMemberships,
  mockFetchLatestMembershipsForCanonicals,
} = vi.hoisted(() => ({
  mockFetchCandidates: vi.fn(),
  mockFetchProductCountsByCanonical: vi.fn(),
  mockCreateRun: vi.fn(),
  mockInsertMemberships: vi.fn(),
  mockFetchLatestMembershipsForCanonicals: vi.fn(),
}))

vi.mock("@/lib/database/canonical-consolidation-db", () => ({
  canonicalConsolidationDB: {
    fetchCandidates: mockFetchCandidates,
    fetchProductCountsByCanonical: mockFetchProductCountsByCanonical,
  },
}))

vi.mock("@/lib/database/canonical-medoid-db", () => ({
  canonicalMedoidDB: {
    createRun: mockCreateRun,
    insertMemberships: mockInsertMemberships,
    fetchLatestMembershipsForCanonicals: mockFetchLatestMembershipsForCanonicals,
  },
}))

function buildRow(
  sourceCanonical: string,
  targetCanonical: string,
  similarity = 0.98
): CanonicalDoubleCheckDailyStatsRow {
  return {
    event_date: "2026-04-01",
    source_canonical: sourceCanonical,
    target_canonical: targetCanonical,
    decision: "skipped",
    reason: "vector_candidate_discovery",
    direction: "lateral",
    event_count: 3,
    source_category: "baking",
    target_category: "baking",
    min_confidence: null,
    max_confidence: null,
    min_similarity: similarity,
    max_similarity: similarity,
  }
}

const clusterRows = [
  buildRow("brown sugar", "sugar", 0.98),
  buildRow("brown sugar", "vanilla sugar", 0.96),
  buildRow("vanilla sugar", "sugar", 0.97),
]

const baseConfig: CanonicalMedoidWorkerConfig = {
  batchLimit: 50,
  maxCycles: 0,
  workerIntervalSeconds: 30 * 24 * 60 * 60,
  minSimilarity: 0.92,
  minEventCount: 2,
  dryRun: false,
  workerName: "test-medoid-worker",
  mode: "initiation",
  stabilityDelta: 0.015,
  snapshotMonth: "2026-04-01",
}

function previousMembership(
  canonicalName: string,
  medoidCanonical: string
): CanonicalMedoidMembershipHistoryRow {
  return {
    canonicalName,
    medoidCanonical,
    snapshotMonth: "2026-03-01",
    selectionMode: "perturbation",
    previousMedoidCanonical: null,
  }
}

describe("runCanonicalMedoidWorker", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})

    mockFetchCandidates.mockResolvedValue([])
    mockFetchProductCountsByCanonical.mockResolvedValue(new Map())
    mockCreateRun.mockResolvedValue("run-1")
    mockInsertMemberships.mockResolvedValue(undefined)
    mockFetchLatestMembershipsForCanonicals.mockResolvedValue(new Map())
  })

  it("selects the strongest medoid in initiation mode and persists memberships", async () => {
    mockFetchCandidates.mockResolvedValueOnce(clusterRows)
    mockFetchProductCountsByCanonical.mockResolvedValueOnce(
      new Map<string, number>([
        ["sugar", 20],
        ["brown sugar", 8],
        ["vanilla sugar", 3],
      ])
    )

    const summary = await runCanonicalMedoidWorker(baseConfig)

    expect(summary).toEqual({
      cycles: 1,
      totalCandidates: 3,
      totalClusters: 1,
      totalAssignments: 3,
      totalRunsCreated: 1,
      mode: "initiation",
      snapshotMonth: "2026-04-01",
    })
    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "initiation",
        clusterCount: 1,
        assignmentCount: 3,
      })
    )
    expect(mockInsertMemberships).toHaveBeenCalledTimes(1)
    const memberships = mockInsertMemberships.mock.calls[0][0]
    expect(memberships).toHaveLength(3)
    expect(memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "brown sugar",
          medoidCanonical: "sugar",
          selectionReason: "initiation_best_score",
        }),
        expect.objectContaining({
          canonicalName: "sugar",
          medoidCanonical: "sugar",
          isMedoid: true,
        }),
        expect.objectContaining({
          canonicalName: "vanilla sugar",
          medoidCanonical: "sugar",
        }),
      ])
    )
  })

  it("retains the previous medoid in perturbation mode when the score delta is below the stability floor", async () => {
    mockFetchCandidates.mockResolvedValueOnce(clusterRows)
    mockFetchProductCountsByCanonical.mockResolvedValueOnce(
      new Map<string, number>([
        ["sugar", 20],
        ["brown sugar", 8],
        ["vanilla sugar", 3],
      ])
    )
    mockFetchLatestMembershipsForCanonicals.mockResolvedValueOnce(
      new Map<string, CanonicalMedoidMembershipHistoryRow>([
        ["brown sugar", previousMembership("brown sugar", "brown sugar")],
        ["sugar", previousMembership("sugar", "brown sugar")],
        ["vanilla sugar", previousMembership("vanilla sugar", "brown sugar")],
      ])
    )

    await runCanonicalMedoidWorker({
      ...baseConfig,
      mode: "perturbation",
      stabilityDelta: 0.2,
    })

    expect(mockInsertMemberships).toHaveBeenCalledTimes(1)
    const memberships = mockInsertMemberships.mock.calls[0][0]
    expect(memberships).toHaveLength(3)
    expect(memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "brown sugar",
          medoidCanonical: "brown sugar",
          selectionReason: "perturbation_retained_previous_medoid",
        }),
        expect.objectContaining({
          canonicalName: "sugar",
          medoidCanonical: "brown sugar",
          previousMedoidCanonical: "brown sugar",
        }),
        expect.objectContaining({
          canonicalName: "vanilla sugar",
          medoidCanonical: "brown sugar",
        }),
      ])
    )
  })

  it("promotes a better medoid in perturbation mode when it clears the stability delta", async () => {
    mockFetchCandidates.mockResolvedValueOnce(clusterRows)
    mockFetchProductCountsByCanonical.mockResolvedValueOnce(
      new Map<string, number>([
        ["sugar", 20],
        ["brown sugar", 8],
        ["vanilla sugar", 3],
      ])
    )
    mockFetchLatestMembershipsForCanonicals.mockResolvedValueOnce(
      new Map<string, CanonicalMedoidMembershipHistoryRow>([
        ["brown sugar", previousMembership("brown sugar", "brown sugar")],
        ["sugar", previousMembership("sugar", "brown sugar")],
        ["vanilla sugar", previousMembership("vanilla sugar", "brown sugar")],
      ])
    )

    await runCanonicalMedoidWorker({
      ...baseConfig,
      mode: "perturbation",
      stabilityDelta: 0.01,
    })

    expect(mockInsertMemberships).toHaveBeenCalledTimes(1)
    const memberships = mockInsertMemberships.mock.calls[0][0]
    expect(memberships).toHaveLength(3)
    expect(memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "brown sugar",
          medoidCanonical: "sugar",
          selectionReason: "perturbation_promoted_better_candidate",
          previousMedoidCanonical: "brown sugar",
        }),
        expect.objectContaining({
          canonicalName: "sugar",
          medoidCanonical: "sugar",
          isMedoid: true,
        }),
        expect.objectContaining({
          canonicalName: "vanilla sugar",
          medoidCanonical: "sugar",
        }),
      ])
    )
  })

  it("skips writes in dry-run mode", async () => {
    mockFetchCandidates.mockResolvedValueOnce(clusterRows)
    mockFetchProductCountsByCanonical.mockResolvedValueOnce(
      new Map<string, number>([
        ["sugar", 20],
        ["brown sugar", 8],
        ["vanilla sugar", 3],
      ])
    )

    const summary = await runCanonicalMedoidWorker({
      ...baseConfig,
      dryRun: true,
    })

    expect(summary.totalRunsCreated).toBe(0)
    expect(mockCreateRun).not.toHaveBeenCalled()
    expect(mockInsertMemberships).not.toHaveBeenCalled()
  })
})
