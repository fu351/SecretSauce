import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const { mockResolveProfileAccess } = vi.hoisted(() => ({
  mockResolveProfileAccess: vi.fn(),
}))

vi.mock("@/lib/social/profile-access", () => ({
  resolveProfileAccess: mockResolveProfileAccess,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
}))

describe("GET /api/users/[username]/pinned-recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 for unauthorized viewers of private profiles", async () => {
    mockResolveProfileAccess.mockResolvedValue({ canViewContent: false })

    const res = await GET(new Request("http://localhost/api/users/avery/pinned-recipes"), {
      params: Promise.resolve({ username: "avery" }),
    })

    expect(res.status).toBe(403)
  })
})
