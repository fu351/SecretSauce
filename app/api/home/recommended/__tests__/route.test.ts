import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const { mockFetchRecipes } = vi.hoisted(() => ({
  mockFetchRecipes: vi.fn(),
}))

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: {
    fetchRecipes: mockFetchRecipes,
  },
}))

describe("home recommended route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns paginated items with hasMore", async () => {
    mockFetchRecipes.mockResolvedValue([
      { id: "1", title: "A" },
      { id: "2", title: "B" },
      { id: "3", title: "C" },
    ])

    const res = await GET(new Request("http://localhost/api/home/recommended?offset=12&limit=2"))

    expect(mockFetchRecipes).toHaveBeenCalledWith({
      sortBy: "created_at",
      offset: 12,
      limit: 3,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      items: [
        { id: "1", title: "A" },
        { id: "2", title: "B" },
      ],
      hasMore: true,
    })
  })
})
