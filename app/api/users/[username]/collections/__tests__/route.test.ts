import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const { mockResolveProfileAccess, mockMaybeCollections, mockMaybeItems, mockFrom } = vi.hoisted(() => {
  const mockMaybeItems = vi.fn()
  const mockMaybeCollections = vi.fn()
  const mockFrom = vi.fn((table: string) => {
    if (table === "recipe_collections") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: mockMaybeCollections,
              }),
            }),
          }),
        }),
      }
    }

    return {
      select: vi.fn().mockReturnValue({
        in: mockMaybeItems,
      }),
    }
  })

  return { mockResolveProfileAccess: vi.fn(), mockMaybeCollections, mockMaybeItems, mockFrom }
})

vi.mock("@/lib/social/profile-access", () => ({
  resolveProfileAccess: mockResolveProfileAccess,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

describe("GET /api/users/[username]/collections", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 for unauthorized viewers of private profiles", async () => {
    mockResolveProfileAccess.mockResolvedValue({ canViewContent: false })

    const res = await GET(new Request("http://localhost/api/users/avery/collections"), {
      params: Promise.resolve({ username: "avery" }),
    })

    expect(res.status).toBe(403)
  })

  it("returns visible collections with counts", async () => {
    mockResolveProfileAccess.mockResolvedValue({
      profile: { id: "profile_1" },
      canViewContent: true,
    })
    mockMaybeCollections.mockResolvedValue({
      data: [
        { id: "col_1", name: "Weeknights", is_default: false },
        { id: "col_2", name: "Saved Recipes", is_default: true },
      ],
      error: null,
    })
    mockMaybeItems.mockResolvedValue({
      data: [{ collection_id: "col_1" }, { collection_id: "col_1" }, { collection_id: "col_2" }],
      error: null,
    })

    const res = await GET(new Request("http://localhost/api/users/avery/collections"), {
      params: Promise.resolve({ username: "avery" }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      collections: [
        { id: "col_1", name: "Weeknights", is_default: false, recipe_count: 2 },
        { id: "col_2", name: "Saved Recipes", is_default: true, recipe_count: 1 },
      ],
    })
  })
})
