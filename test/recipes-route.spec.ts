import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
  getFollowStatus: vi.fn(),
  resolveAuthenticatedProfileId: vi.fn(),
  isAdmin: vi.fn(),
  upsertRecipeWithIngredients: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient,
}))

vi.mock("@/lib/database/follow-db", () => ({
  followDB: {
    withServiceClient: () => ({
      getFollowStatus: mocks.getFollowStatus,
    }),
  },
}))

vi.mock("@/lib/auth/admin", () => ({
  resolveAuthenticatedProfileId: mocks.resolveAuthenticatedProfileId,
  isAdmin: mocks.isAdmin,
}))

vi.mock("@/lib/database/recipe-write", () => ({
  upsertRecipeWithIngredients: mocks.upsertRecipeWithIngredients,
}))

import { GET } from "@/app/api/recipes/[id]/route"

function createQuery(result: unknown) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  }
  return query
}

describe("recipes route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ userId: null })
    mocks.getFollowStatus.mockResolvedValue({ status: "none" })
  })

  it("does not expose private-profile recipes to anonymous callers", async () => {
    const recipeQuery = createQuery({
      data: {
        id: "recipe_private",
        title: "Private family stew",
        author_id: "profile_private",
        content: { instructions: ["Keep this in the family."] },
        recipe_ingredients: [],
        deleted_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    })
    const authorProfileQuery = createQuery({
      data: {
        id: "profile_private",
        username: "privatecook",
        full_name: "Private Cook",
        avatar_url: null,
        is_private: true,
      },
      error: null,
    })

    mocks.createServiceSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipeQuery
        if (table === "profiles") return authorProfileQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const response = await GET(new Request("http://localhost/api/recipes/recipe_private"), {
      params: Promise.resolve({ id: "recipe_private" }),
    })

    expect([403, 404]).toContain(response.status)
    await expect(response.json()).resolves.not.toHaveProperty("recipe")
  })
})
