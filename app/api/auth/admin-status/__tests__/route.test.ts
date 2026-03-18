import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const { mockAuth, mockGetUser, mockClerkClient } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockGetUser = vi.fn()
  const mockClerkClient = vi.fn(() => ({ users: { getUser: mockGetUser } }))
  return { mockAuth, mockGetUser, mockClerkClient }
})

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}))

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}))

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

describe("GET /api/auth/admin-status", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns false flags for unauthenticated users", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ isAdmin: false, canViewAnalytics: false })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("returns rpc permissions when profile resolves by clerk_user_id", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockFrom.mockReturnValueOnce(createSelectChain({ data: { id: "profile_1" } }))
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ isAdmin: true, canViewAnalytics: false })
    expect(mockRpc).toHaveBeenCalledWith("is_admin", { p_user_id: "profile_1" })
    expect(mockRpc).toHaveBeenCalledWith("can_view_analytics", { p_user_id: "profile_1" })
  })

  it("falls back to email lookup and links clerk_user_id before checking permissions", async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null })

    mockAuth.mockResolvedValue({ userId: "user_fallback" })
    mockGetUser.mockResolvedValue({
      primaryEmailAddressId: "email_1",
      emailAddresses: [{ id: "email_1", emailAddress: "fallback@example.com" }],
    })
    mockFrom
      .mockReturnValueOnce(createSelectChain({ data: null }))
      .mockReturnValueOnce(
        createSelectChain({ data: { id: "profile_email", clerk_user_id: null } })
      )
      .mockReturnValueOnce(createUpdateChain(updateEq))
    mockRpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ isAdmin: false, canViewAnalytics: true })
    expect(updateEq).toHaveBeenCalledWith("id", "profile_email")
  })

  it("returns false flags when no profile can be resolved", async () => {
    mockAuth.mockResolvedValue({ userId: "user_missing_profile" })
    mockGetUser.mockResolvedValue({
      primaryEmailAddressId: null,
      emailAddresses: [],
    })
    mockFrom.mockReturnValueOnce(createSelectChain({ data: null }))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ isAdmin: false, canViewAnalytics: false })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("returns 500 fallback when an unexpected error occurs", async () => {
    mockAuth.mockRejectedValue(new Error("boom"))

    const res = await GET()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ isAdmin: false, canViewAnalytics: false })
  })
})
