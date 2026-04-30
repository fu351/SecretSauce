import { describe, expect, it, vi } from "vitest"
import {
  FOUNDATION_FEATURE_FLAGS,
  getFoundationFeatureFlagKey,
  resolveFoundationFeatureEnabled,
} from "@/lib/foundation/feature-flags"
import {
  buildPreferenceDbUpdate,
  DEFAULT_USER_FEATURE_PREFERENCES,
  normalizeUserFeaturePreferences,
} from "@/lib/foundation/preferences"
import { getSocialProjectionPrivacyViolations } from "@/lib/foundation/privacy"
import { isValidOwnerScopedMediaPath } from "@/lib/foundation/media-service"

describe("foundation core helpers", () => {
  it("defines all expected shared foundation flags", () => {
    expect(Object.keys(FOUNDATION_FEATURE_FLAGS).sort()).toEqual([
      "budget_tracking",
      "campus_cups",
      "cook_checks",
      "gamification_streaks",
      "pantry_ai_scan",
      "pantry_tracking",
      "photo_verification",
      "receipt_scanning",
      "reward_vault",
      "social_layer",
    ])
    expect(getFoundationFeatureFlagKey("social_layer")).toBe("secret-sauce-social-foundation")
  })

  it("uses fallback when PostHog is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_SECRET_SAUCE_BUDGET_FOUNDATION", "false")
    expect(resolveFoundationFeatureEnabled("budget_tracking", undefined)).toBe(false)
    expect(resolveFoundationFeatureEnabled("budget_tracking", null)).toBe(false)
    expect(resolveFoundationFeatureEnabled("budget_tracking", true)).toBe(true)
    vi.unstubAllEnvs()
  })

  it("normalizes preference defaults and allowlisted updates", () => {
    expect(normalizeUserFeaturePreferences(null)).toEqual(DEFAULT_USER_FEATURE_PREFERENCES)
    const update = buildPreferenceDbUpdate({
      socialEnabled: true,
      budgetTrackingEnabled: false,
      profile_id: "attacker",
      userId: "attacker",
    })
    expect(update).toEqual({
      social_enabled: true,
      budget_tracking_enabled: false,
    })
  })

  it("rejects forbidden social projection payload keys", () => {
    const violations = getSocialProjectionPrivacyViolations({
      publicMessage: "nice cooking streak",
      private: { budgetAmount: 123 },
    })
    expect(violations.length).toBeGreaterThan(0)
  })

  it("validates owner-scoped private media paths", () => {
    expect(isValidOwnerScopedMediaPath("profile_1", "profile_1/image.png")).toBe(true)
    expect(isValidOwnerScopedMediaPath("profile_1", "profile_2/image.png")).toBe(false)
    expect(isValidOwnerScopedMediaPath("profile_1", "profile_1/../image.png")).toBe(false)
  })
})
