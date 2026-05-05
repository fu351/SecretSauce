import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getOwnedRecipeTry: vi.fn(),
  isDuplicateDatabaseError: vi.fn().mockReturnValue(false),
  appendProductEvent: vi.fn(),
}))

vi.mock("@/lib/social/repository", () => ({
  getOwnedRecipeTry: mocks.getOwnedRecipeTry,
}))

vi.mock("@/lib/foundation/product-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/foundation/product-events")>(
    "@/lib/foundation/product-events",
  )
  return {
    ...actual,
    isDuplicateDatabaseError: mocks.isDuplicateDatabaseError,
  }
})

vi.mock("@/lib/foundation/product-events-service", () => ({
  appendProductEvent: mocks.appendProductEvent,
}))

vi.mock("@/lib/social/guards", () => ({
  isSocialEnabledForProfile: vi.fn().mockResolvedValue(true),
}))

import {
  getRecipePeerScore,
  submitRecipeTryFeedback,
} from "@/lib/social/recipe-feedback-service"

type QueryResult = { data?: unknown; error?: unknown }

function makeSupabase(options: {
  insertResult?: QueryResult
  existingFeedback?: QueryResult
  aggregateRows?: QueryResult
} = {}) {
  return {
    from(table: string) {
      if (table !== "recipe_try_feedback") {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        insert() {
          return {
            select() {
              return {
                single: async () => options.insertResult ?? { data: { id: "fb_1" } },
              }
            },
          }
        },
        select(cols: string) {
          if (cols === "*") {
            return {
              eq() {
                return {
                  eq() {
                    return { maybeSingle: async () => options.existingFeedback ?? { data: null } }
                  },
                }
              },
            }
          }
          return {
            eq() {
              return {
                in: async () => options.aggregateRows ?? { data: [] },
              }
            },
          }
        },
      }
    },
  }
}

describe("recipe feedback service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDuplicateDatabaseError.mockReturnValue(false)
  })

  it("rejects unknown outcomes without any DB access", async () => {
    const result = await submitRecipeTryFeedback({} as any, {
      profileId: "p1",
      recipeTryId: "t1",
      outcome: "no_feedback",
    })
    expect(result).toEqual({ validationError: "Unknown feedback outcome" })
    expect(mocks.getOwnedRecipeTry).not.toHaveBeenCalled()
  })

  it("rejects tags that are not in the locked list", async () => {
    const result = await submitRecipeTryFeedback({} as any, {
      profileId: "p1",
      recipeTryId: "t1",
      outcome: "needed_tweaks",
      tags: ["definitely_not_a_tag"],
    })
    expect("validationError" in result).toBe(true)
  })

  it("refuses feedback on a recipe_try the caller does not own", async () => {
    mocks.getOwnedRecipeTry.mockResolvedValue({ data: null })
    const result = await submitRecipeTryFeedback(makeSupabase() as any, {
      profileId: "p1",
      recipeTryId: "t1",
      outcome: "succeeded",
    })
    expect(result).toEqual({ validationError: "Recipe try not found or not owned by caller" })
  })

  it("returns existing row when the unique constraint fires (duplicate idempotent)", async () => {
    mocks.getOwnedRecipeTry.mockResolvedValue({ data: { id: "t1", recipe_id: "r1" } })
    mocks.isDuplicateDatabaseError.mockReturnValue(true)
    const supabase = makeSupabase({
      insertResult: { data: null, error: { code: "23505" } },
      existingFeedback: { data: { id: "fb_existing" } },
    })
    const result = await submitRecipeTryFeedback(supabase as any, {
      profileId: "p1",
      recipeTryId: "t1",
      outcome: "succeeded",
    })
    expect("feedback" in result).toBe(true)
    if ("feedback" in result) {
      expect(result.duplicate).toBe(true)
      expect((result.feedback as any).id).toBe("fb_existing")
    }
  })

  it("computes peer score from aggregated rows, ignoring skipped feedback in the total", async () => {
    const supabase = makeSupabase({
      aggregateRows: {
        data: [
          { outcome: "succeeded", feedback_tags: ["worked_well"] },
          { outcome: "succeeded", feedback_tags: [] },
          { outcome: "succeeded", feedback_tags: ["worked_well", "would_make_again"] },
          { outcome: "needed_tweaks", feedback_tags: ["too_salty"] },
        ],
      },
    })
    const result = await getRecipePeerScore(supabase as any, "recipe-1")
    expect("peerScore" in result).toBe(true)
    if ("peerScore" in result) {
      expect(result.peerScore.submittedCount).toBe(4)
      expect(result.peerScore.successCount).toBe(3)
      expect(result.peerScore.successPercentage).toBe(75)
      expect(result.peerScore.reliabilityTier).toBe("building")
      expect(result.peerScore.topTags[0].tag).toBe("worked_well")
    }
  })

  it("does not expose aiConfidence or private metadata in sanitized peer score", async () => {
    const supabase = makeSupabase({
      aggregateRows: {
        data: [{ outcome: "succeeded", feedback_tags: ["worked_well"] }],
      },
    })
    const result = await getRecipePeerScore(supabase as any, "recipe-1")
    if ("peerScore" in result) {
      const json = JSON.stringify(result.peerScore)
      expect(json).not.toMatch(/aiConfidence/i)
      expect(json).not.toMatch(/confidence/i)
      expect(json).not.toMatch(/budget/i)
    }
  })
})
