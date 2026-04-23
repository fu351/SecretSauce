import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const { mockResolveProfileAccess, mockRange } = vi.hoisted(() => {
  const mockRange = vi.fn()
  return {
    mockResolveProfileAccess: vi.fn(),
    mockRange,
  }
})

vi.mock("@/lib/social/profile-access", () => ({
  resolveProfileAccess: mockResolveProfileAccess,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: mockRange,
            }),
          }),
        }),
      }),
    })),
  })),
}))

describe("GET /api/users/[username]/recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 for unauthorized viewers of private profiles", async () => {
    mockResolveProfileAccess.mockResolvedValue({ canViewContent: false })

    const res = await GET(new Request("http://localhost/api/users/avery/recipes"), {
      params: Promise.resolve({ username: "avery" }),
    })

    expect(res.status).toBe(403)
  })
})
