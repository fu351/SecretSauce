import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const {
  mockAuth,
  mockFrom,
  mockGetFollowStatus,
  mockWithServiceClient,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockGetFollowStatus: vi.fn(),
  mockWithServiceClient: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("@/lib/database/follow-db", () => ({
  followDB: {
    withServiceClient: mockWithServiceClient,
  },
}))

vi.mock("@/lib/types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/types")>("@/lib/types")
  return {
    ...actual,
    parseInstructionsFromDB: vi.fn(() => [{ description: "Simmer everything." }]),
  }
})

describe("recipes/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "clerk_1" })
    mockWithServiceClient.mockReturnValue({
      getFollowStatus: mockGetFollowStatus,
    })
    mockGetFollowStatus.mockResolvedValue({ status: "accepted" })

    mockFrom.mockImplementation((table: string) => {
      if (table === "recipes") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "recipe_1",
                    title: "Soup",
                    prep_time: 10,
                    cook_time: 20,
                    servings: 4,
                    difficulty: "beginner",
                    rating_avg: 4.5,
                    rating_count: 2,
                    nutrition: {},
                    author_id: "author_1",
                    description: "Cozy soup",
                    image_url: "/soup.jpg",
                    instructions_list: ["Simmer everything."],
                    tags: ["comfort"],
                    created_at: "2026-01-01T00:00:00.000Z",
                    recipe_ingredients: [],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }

      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((column: string, value: string) => ({
              maybeSingle: vi.fn().mockResolvedValue(
                column === "id"
                  ? {
                      data: {
                        id: value,
                        username: "chef-soup",
                        full_name: "Chef Soup",
                        avatar_url: null,
                        is_private: false,
                      },
                    }
                  : { data: { id: "viewer_1" } }
              ),
            })),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it("returns recipe details with author metadata and follow status", async () => {
    const res = await GET(new Request("http://localhost/api/recipes/recipe_1"), {
      params: Promise.resolve({ id: "recipe_1" }),
    })

    expect(res.status).toBe(200)
    const payload = await res.json()

    expect(payload.recipe).toMatchObject({
      id: "recipe_1",
      title: "Soup",
      author_id: "author_1",
    })
    expect(payload.author).toEqual({
      id: "author_1",
      username: "chef-soup",
      full_name: "Chef Soup",
      avatar_url: null,
      is_private: false,
      followStatus: "accepted",
    })
    expect(mockGetFollowStatus).toHaveBeenCalledWith("viewer_1", "author_1")
  })
})
