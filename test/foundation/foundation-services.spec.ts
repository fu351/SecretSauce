import { describe, expect, it, vi } from "vitest"
import { appendProductEvent } from "@/lib/foundation/product-events-service"
import { createRecipeTry } from "@/lib/foundation/recipe-tries"
import { applyUserVerificationDecision, createVerificationTaskWithRouting } from "@/lib/foundation/verification-service"

describe("foundation service idempotency and routing", () => {
  it("returns existing product event when idempotency key is duplicate", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }),
    })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "evt_1" }, error: null })
    const from = vi.fn(() => ({
      insert,
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
    }))

    const result = await appendProductEvent({ from } as any, "profile_1", {
      eventType: "recipe_try.logged",
      idempotencyKey: "dup",
      metadata: {},
    })
    expect(result).toMatchObject({ duplicate: true })
  })

  it("routes high confidence verification to auto_accepted", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "vt_1", status: "auto_accepted" }, error: null })
    const result = await createVerificationTaskWithRouting(
      { from: () => ({ insert: () => ({ select: () => ({ single }) }) }) } as any,
      "profile_1",
      { featureArea: "recipe", sourceType: "meal_photo", confidence: 0.92 },
    )
    expect((result as any).verificationTask.status).toBe("auto_accepted")
  })

  it("applies user confirmation transition", async () => {
    const taskUpdate = vi.fn().mockReturnValue({
      eq: () => ({
        eq: () => ({
          select: () => ({ single: async () => ({ data: { id: "vt_1", status: "user_confirmed" }, error: null }) }),
        }),
      }),
    })
    const confirmationUpdate = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ eq: async () => ({ data: null, error: null }) }) }),
    })
    const from = vi.fn((table: string) => ({
      update: table === "verification_tasks" ? taskUpdate : confirmationUpdate,
    }))

    const result = await applyUserVerificationDecision({ from } as any, "profile_1", "vt_1", "confirm", {})
    expect((result as any).verificationTask.status).toBe("user_confirmed")
  })

  it("returns existing recipe try for duplicate idempotency key", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }),
    })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "try_1" }, error: null })
    const from = vi.fn(() => ({
      insert,
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
    }))
    const result = await createRecipeTry({ from } as any, "profile_1", {
      occurredOn: "2026-04-29",
      idempotencyKey: "dup",
    })
    expect(result).toMatchObject({ duplicate: true })
  })
})
