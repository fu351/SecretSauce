import { describe, expect, it } from "vitest"
import {
  buildCookCheckProjectionPayload,
  canViewerSeeVisibility,
  isCookCheckExpired,
  isSocialActivityType,
  isValidSocialVisibility,
  normalizeCaption,
  validateReactionKey,
} from "@/lib/social/helpers"
import { assertSafeSocialProjectionPayload } from "@/lib/foundation/privacy"

describe("social helpers", () => {
  it("validates social activity compatibility list", () => {
    expect(isSocialActivityType("cook_check")).toBe(true)
    expect(isSocialActivityType("competition_win")).toBe(true)
    expect(isSocialActivityType("unknown")).toBe(false)
  })

  it("validates visibility and caption normalization", () => {
    expect(isValidSocialVisibility("private")).toBe(true)
    expect(isValidSocialVisibility("friends")).toBe(false)
    expect(normalizeCaption("  hello  ")).toBe("hello")
    expect(normalizeCaption("")).toBeNull()
  })

  it("validates reactions and expiry", () => {
    expect(validateReactionKey("fire")).toBe(true)
    expect(validateReactionKey("heart")).toBe(false)
    expect(isCookCheckExpired(new Date(Date.now() - 1000).toISOString())).toBe(true)
  })

  it("enforces visibility correctly", () => {
    expect(
      canViewerSeeVisibility({
        ownerProfileId: "owner",
        viewerProfileId: "viewer",
        visibility: "private",
        viewerFollowsOwner: true,
      }),
    ).toBe(false)
    expect(
      canViewerSeeVisibility({
        ownerProfileId: "owner",
        viewerProfileId: "viewer",
        visibility: "followers",
        viewerFollowsOwner: true,
      }),
    ).toBe(true)
  })

  it("projection payload sanitizer blocks private keys", () => {
    expect(() =>
      assertSafeSocialProjectionPayload({
        cookCheckId: "cook_1",
        aiConfidence: 0.3,
      }),
    ).toThrow()
  })
})
