import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "../route"

const { mockVerifyWebhook } = vi.hoisted(() => ({
  mockVerifyWebhook: vi.fn(),
}))

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: mockVerifyWebhook,
}))

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

const { mockProfileIdFromClerkUserId } = vi.hoisted(() => ({
  mockProfileIdFromClerkUserId: vi.fn(() => "deterministic-profile-id"),
}))

vi.mock("@/lib/auth/clerk-profile-id", () => ({
  profileIdFromClerkUserId: mockProfileIdFromClerkUserId,
}))

const makeRequest = () =>
  new NextRequest("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: "{}",
  })

const createSelectChain = (result: unknown) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(result),
    }),
  }),
})

const createUpdateChain = (eqMock = vi.fn().mockResolvedValue({ data: null, error: null })) => ({
  update: vi.fn().mockReturnValue({
    eq: eqMock,
  }),
})

const createUpsertChain = (result = { error: null }) => ({
  upsert: vi.fn().mockResolvedValue(result),
})

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 when Clerk webhook signature verification fails", async () => {
    mockVerifyWebhook.mockRejectedValue(new Error("invalid signature"))

    const res = await POST(makeRequest())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid webhook signature" })
  })

  it("returns skipped response when user.created has no primary email", async () => {
    mockVerifyWebhook.mockResolvedValue({
      type: "user.created",
      data: {
        id: "user_123",
        primaryEmailAddressId: "email_1",
        emailAddresses: [],
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, skipped: true })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("creates deterministic profile when no profile exists for clerk id or email", async () => {
    const upsertChain = createUpsertChain({ error: null })

    mockVerifyWebhook.mockResolvedValue({
      type: "user.created",
      data: {
        id: "user_new",
        primaryEmailAddressId: "email_1",
        emailAddresses: [
          {
            id: "email_1",
            emailAddress: "new@example.com",
            verification: { status: "verified" },
          },
        ],
        firstName: "New",
        lastName: "User",
        imageUrl: "https://example.com/avatar.png",
      },
    })
    mockFrom
      .mockReturnValueOnce(createSelectChain({ data: null }))
      .mockReturnValueOnce(createSelectChain({ data: null }))
      .mockReturnValueOnce(upsertChain)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, created: true })
    expect(mockProfileIdFromClerkUserId).toHaveBeenCalledWith("user_new")
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "deterministic-profile-id",
        clerk_user_id: "user_new",
        email: "new@example.com",
        full_name: "New User",
        avatar_url: "https://example.com/avatar.png",
        email_verified: true,
      }),
      { onConflict: "id" }
    )
  })

  it("updates existing profile matched by clerk_user_id", async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null })

    mockVerifyWebhook.mockResolvedValue({
      type: "user.updated",
      data: {
        id: "user_existing",
        primaryEmailAddressId: "email_1",
        emailAddresses: [
          {
            id: "email_1",
            emailAddress: "existing@example.com",
            verification: { status: "verified" },
          },
        ],
        fullName: "Existing User",
      },
    })
    mockFrom
      .mockReturnValueOnce(createSelectChain({ data: { id: "profile_1" } }))
      .mockReturnValueOnce(createUpdateChain(updateEq))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(updateEq).toHaveBeenCalledWith("id", "profile_1")
  })

  it("handles replayed user.updated webhooks idempotently", async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null })

    const event = {
      type: "user.updated",
      data: {
        id: "user_replay",
        primaryEmailAddressId: "email_1",
        emailAddresses: [{ id: "email_1", emailAddress: "replay@example.com" }],
      },
    }
    mockVerifyWebhook.mockResolvedValue(event)
    mockFrom
      .mockReturnValueOnce(createSelectChain({ data: { id: "profile_replay" } }))
      .mockReturnValueOnce(createUpdateChain(updateEq))
      .mockReturnValueOnce(createSelectChain({ data: { id: "profile_replay" } }))
      .mockReturnValueOnce(createUpdateChain(updateEq))

    const first = await POST(makeRequest())
    const second = await POST(makeRequest())

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(updateEq).toHaveBeenCalledTimes(2)
    expect(updateEq).toHaveBeenNthCalledWith(1, "id", "profile_replay")
    expect(updateEq).toHaveBeenNthCalledWith(2, "id", "profile_replay")
  })

  it("updates profile linkage on user.deleted", async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null })

    mockVerifyWebhook.mockResolvedValue({
      type: "user.deleted",
      data: { id: "user_deleted" },
    })
    mockFrom.mockReturnValueOnce(createUpdateChain(updateEq))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(updateEq).toHaveBeenCalledWith("clerk_user_id", "user_deleted")
  })

  it("returns 500 when deterministic profile creation fails", async () => {
    mockVerifyWebhook.mockResolvedValue({
      type: "user.created",
      data: {
        id: "user_fail",
        primaryEmailAddressId: "email_1",
        emailAddresses: [{ id: "email_1", emailAddress: "fail@example.com" }],
      },
    })
    mockFrom
      .mockReturnValueOnce(createSelectChain({ data: null }))
      .mockReturnValueOnce(createSelectChain({ data: null }))
      .mockReturnValueOnce(createUpsertChain({ error: { message: "db write failed" } }))

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Failed to create profile" })
  })

  it("returns 500 when webhook processing throws unexpectedly", async () => {
    mockVerifyWebhook.mockResolvedValue({
      type: "user.updated",
      data: {
        id: "user_throws",
        primaryEmailAddressId: "email_1",
        emailAddresses: [{ id: "email_1", emailAddress: "throws@example.com" }],
      },
    })
    mockFrom.mockImplementation(() => {
      throw new Error("db unavailable")
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Webhook processing failed" })
  })
})
