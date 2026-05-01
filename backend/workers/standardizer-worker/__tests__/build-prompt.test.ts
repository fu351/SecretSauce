import { describe, expect, it } from "vitest"
import { getIngredientStandardizerContextRules } from "../ingredient-standardizer"
import { buildIngredientStandardizerPrompt } from "../prompts/ingredient/build-prompt"
import { buildUnitStandardizerPrompt } from "../prompts/unit/build-prompt"

describe("buildUnitStandardizerPrompt", () => {
  it("includes allowed units and strict output requirements", () => {
    const prompt = buildUnitStandardizerPrompt({
      allowedUnits: ["oz", "lb", "unit"],
      inputs: [
        {
          id: "q1",
          rawProductName: "Olive Oil 16 fl oz",
          cleanedName: "olive oil",
          rawUnit: "16 fl oz",
          source: "scraper",
        },
      ],
    })

    expect(prompt).toContain("Prompt version: unit-v2")
    expect(prompt).toContain("Return ONLY valid JSON")
    expect(prompt).toContain("oz, lb, unit")
    expect(prompt).toContain("\"id\": \"q1\"")
  })
})

describe("buildIngredientStandardizerPrompt", () => {
  it("includes scraper-specific guidance and the updated prompt version", () => {
    const prompt = buildIngredientStandardizerPrompt({
      inputs: [{ id: "i1", name: "Hamburger Helper Deluxe Beef Stroganoff Pasta Meal Kit - 5.5oz" }],
      canonicalNames: ["pasta", "tomato soup"],
      context: "scraper",
      contextRules: getIngredientStandardizerContextRules("scraper"),
    })

    expect(prompt).toContain("Prompt version: ingredient-v5")
    expect(prompt).toContain("CURRENT CONTEXT: SCRAPER")
    expect(prompt).toContain("Retail-title noise is a red flag")
    expect(prompt).toContain("grated parmigiano reggiano")
    expect(prompt).toContain("baby puffs")
    expect(prompt).toContain("fresh bocconcini mozzarella, sliced")
    expect(prompt).toContain("Lightly Smoked Sardines in Olive Oil 4.25 Oz")
    expect(prompt).toContain("Anna-Kaci Women's Embroidered Sausage Dog Baseball Cap")
    expect(prompt).toContain("\"id\": \"i1\"")
  })
})
