import { describe, expect, it } from "vitest"
import { buildUnitStandardizerPrompt } from "./build-prompt"

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

    expect(prompt).toContain("Prompt version: unit-v1")
    expect(prompt).toContain("Return ONLY valid JSON")
    expect(prompt).toContain("oz, lb, unit")
    expect(prompt).toContain("\"id\": \"q1\"")
  })
})
