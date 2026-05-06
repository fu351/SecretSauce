import { describe, expect, it } from "vitest"
import {
  buildMealPlanShareProjectionPayload,
  calculateJourneyProgress,
  canRemixMealPlan,
  detectJourneyCompletion,
  sanitizeJourneyProjectionPayload,
  sanitizeMealPlanForShare,
  validateJourneyType,
} from "@/lib/social/meal-plan-sharing"
import { assertSafeSocialProjectionPayload } from "@/lib/foundation/privacy"

describe("Social Sprint 3 meal plan and journey helpers", () => {
  it("sanitizes meal plan shares without carrying private source fields", () => {
    const summary = sanitizeMealPlanForShare({
      title: "Finals Week Meal Plan",
      weekIndex: 202619,
      estimatedTotalLabel: "About $80",
      accomplishmentLabels: ["high-protein", "remixable"],
      meals: [
        {
          date: "2026-05-04",
          meal_type: "dinner",
          recipe_id: "recipe-1",
          recipe: {
            id: "recipe-1",
            title: "Chicken Bowl",
            tags: ["meal-prep"],
            protein: "high_protein",
            pantryInventory: ["private"],
            receiptTotal: 123,
            aiConfidence: 0.4,
          } as any,
        },
      ],
    })

    expect(summary).toMatchObject({
      title: "Finals Week Meal Plan",
      mealCount: 1,
      recipeTitles: ["Chicken Bowl"],
      estimatedTotalLabel: "About $80",
    })
    expect(JSON.stringify(summary)).not.toContain("pantryInventory")
    expect(JSON.stringify(summary)).not.toContain("receiptTotal")
    expect(JSON.stringify(summary)).not.toContain("aiConfidence")
    expect(() => assertSafeSocialProjectionPayload(summary)).not.toThrow()
  })

  it("builds safe projection payloads for shared plans", () => {
    const summary = sanitizeMealPlanForShare({
      title: "Meal Prep Starter Journey",
      weekIndex: 202619,
      meals: [
        {
          date: "2026-05-04",
          meal_type: "lunch",
          recipe_id: "recipe-1",
          recipe: { id: "recipe-1", title: "Lentil Soup", tags: ["meal-prep"] },
        },
      ],
    })

    const payload = buildMealPlanShareProjectionPayload({ shareId: "share-1", summary })
    expect(payload.activityType).toBe("meal_plan_share")
    expect(payload).not.toHaveProperty("budget")
    expect(payload).not.toHaveProperty("pantryInventory")
    expect(() => assertSafeSocialProjectionPayload(payload)).not.toThrow()
  })

  it("enforces remix eligibility from visibility", () => {
    expect(
      canRemixMealPlan({
        ownerProfileId: "owner",
        viewerProfileId: "viewer",
        visibility: "private",
        status: "published",
        viewerFollowsOwner: true,
      }),
    ).toBe(false)
    expect(
      canRemixMealPlan({
        ownerProfileId: "owner",
        viewerProfileId: "viewer",
        visibility: "followers",
        status: "published",
        viewerFollowsOwner: true,
      }),
    ).toBe(true)
  })

  it("calculates journey progress and completion", () => {
    expect(validateJourneyType("meal_prep")).toBe(true)
    expect(validateJourneyType("leaderboard")).toBe(false)
    expect(calculateJourneyProgress({ currentProgress: 13, targetCount: 21, delta: 1 })).toMatchObject({
      currentProgress: 14,
      percentComplete: 67,
      completed: false,
    })
    expect(detectJourneyCompletion({ currentProgress: 21, targetCount: 21 })).toBe(true)
  })

  it("creates safe completed journey projection payloads", () => {
    const payload = sanitizeJourneyProjectionPayload({
      journeyId: "journey-1",
      title: "21-Day Cooking Rhythm",
      journeyType: "cooking_rhythm",
      currentProgress: 21,
      targetCount: 21,
    })

    expect(payload).toMatchObject({
      activityType: "cooking_journey",
      progressLabel: "21/21",
      achievementLabel: "Journey completed",
    })
    expect(() => assertSafeSocialProjectionPayload(payload)).not.toThrow()
  })
})
