import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/database/recipe-db", () => ({
  recipeDB: { fetchRecipes: vi.fn() },
}))

import { recipeDB } from "@/lib/database/recipe-db"
import { fetchRecipeCandidates, recipeToCandidate } from "../recipe-candidates"

afterEach(() => vi.clearAllMocks())

describe("recipeToCandidate", () => {
  it("prefers standardizedName and tokenizes ingredients", () => {
    const recipe: any = {
      id: "r1",
      title: "Pork & Rice",
      cuisine_name: "Mediterranean",
      ingredients: [
        { name: "Pork Shoulder", standardizedName: "pork" },
        { name: "White Rice" },
      ],
    }
    const candidate = recipeToCandidate(recipe)
    expect(candidate).toEqual({
      id: "r1",
      title: "Pork & Rice",
      cuisine: "Mediterranean",
      ingredientTokens: ["pork", "white_rice"],
    })
  })

  it("drops blank ingredient names", () => {
    const recipe: any = { id: "r2", title: "Empty", ingredients: [{ name: "" }, { name: "  " }] }
    expect(recipeToCandidate(recipe).ingredientTokens).toEqual([])
  })
})

describe("fetchRecipeCandidates", () => {
  it("maps fetched recipes to candidates", async () => {
    ;(recipeDB.fetchRecipes as any).mockResolvedValue([
      { id: "r1", title: "Pork stew", ingredients: [{ name: "pork" }], cuisine_name: "Mediterranean" },
    ])
    const result = await fetchRecipeCandidates({ limit: 10 })
    expect(recipeDB.fetchRecipes).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }))
    expect(result).toEqual([
      { id: "r1", title: "Pork stew", ingredientTokens: ["pork"], cuisine: "Mediterranean" },
    ])
  })
})
