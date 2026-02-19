/**
 * Integration tests for the freeform recipe ingestion pipeline.
 *
 * These tests cover parseRecipeText end-to-end: instruction-style prose,
 * structured lists, mixed formats, section-header filtering, deduplication,
 * and the "and" conjunction categorization used by the UI.
 *
 * No network / DB calls — unit vocabulary is sourced from test/fixtures/unit-keywords.json.
 *
 * Key parser behaviors documented here:
 * - Embedded qty+unit is extracted from instruction sentences via scanEmbedded.
 * - The name group captures text greedily up to the first punctuation (,;.) or newline.
 *   So "olive oil to the pan" is the full name when the sentence ends with a period.
 * - trimName strips trailing " and <digit>..." (e.g. "butter and 1 tbsp oil" → "butter").
 *   It does NOT strip " and <word>..." (e.g. "butter and olive oil" stays intact → conjunction category).
 */
import { parseRecipeText } from "@/lib/ingredient-parser"
import unitKeywords from "@/test/fixtures/unit-keywords.json"

// ── Helpers ───────────────────────────────────────────────────────────────────

const parse = (text: string) => parseRecipeText(text, unitKeywords)

// ── 1. Structured list — chicken marinade block ───────────────────────────────

describe("Structured ingredient list", () => {
  const BLOCK = `
Chicken Marinade:
2 lbs chicken thighs, boneless skinless
3 cloves garlic, minced
1/4 cup soy sauce
1 1/2 tbsp honey
2 tsp sesame oil
1 tsp fresh ginger, grated
salt and pepper to taste

For the sauce:
3 tbsp hoisin sauce
2 tbsp rice vinegar
1/2 cup chicken broth
`.trim()

  test("section headers are dropped", () => {
    const rows = parse(BLOCK)
    const names = rows.map((r) => r.name)
    expect(names).not.toContain("Chicken Marinade:")
    expect(names).not.toContain("For the sauce:")
  })

  test("all measurable ingredients extracted", () => {
    const rows = parse(BLOCK)
    const named = rows.map((r) => r.name)
    expect(named).toContain("chicken thighs, boneless skinless")
    expect(named).toContain("garlic, minced")
    expect(named).toContain("soy sauce")
    expect(named).toContain("honey")
    expect(named).toContain("sesame oil")
    expect(named).toContain("fresh ginger, grated")
    expect(named).toContain("hoisin sauce")
    expect(named).toContain("rice vinegar")
    expect(named).toContain("chicken broth")
  })

  test("fractions parsed correctly", () => {
    const rows = parse(BLOCK)
    const soy = rows.find((r) => r.name === "soy sauce")
    expect(soy?.quantity).toBeCloseTo(0.25)
    expect(soy?.unit).toBe("cup")

    const honey = rows.find((r) => r.name === "honey")
    expect(honey?.quantity).toBeCloseTo(1.5)
    expect(honey?.unit).toBe("tbsp")

    const broth = rows.find((r) => r.name === "chicken broth")
    expect(broth?.quantity).toBeCloseTo(0.5)
    expect(broth?.unit).toBe("cup")
  })

  test("'salt and pepper to taste' is extracted as name-only", () => {
    const rows = parse(BLOCK)
    const saltRow = rows.find((r) => r.name.includes("salt"))
    expect(saltRow).toBeDefined()
    expect(saltRow?.quantity).toBeNull()
    expect(saltRow?.unit).toBeNull()
  })
})

// ── 2. Instruction-style prose extraction ────────────────────────────────────

describe("Instruction-style prose extraction", () => {
  test("extracts embedded qty+unit from an instruction sentence", () => {
    // "butter and 1 tablespoon oil" — trimName strips the " and 1..." portion,
    // leaving "butter". The second qty (1 tbsp oil) was consumed inside the
    // first match's greedy name group and is not separately extracted.
    const rows = parse("Add 2 tablespoons butter and 1 tablespoon oil to the pan.")
    const butter = rows.find((r) => r.name === "butter")
    expect(butter).toBeDefined()
    expect(butter?.quantity).toBe(2)
    expect(butter?.unit).toBe("tablespoons")
  })

  test("extracts fraction embedded in prose", () => {
    // The name captures up to period, so it may include trailing instruction text.
    const rows = parse("Stir in 1/4 cup soy sauce and simmer for 10 minutes.")
    const soy = rows.find((r) => r.name.startsWith("soy sauce"))
    expect(soy).toBeDefined()
    expect(soy?.quantity).toBeCloseTo(0.25)
    expect(soy?.unit).toBe("cup")
  })

  test("pure instruction sentences with no qty are filtered out", () => {
    const rows = parse("Heat a large skillet over medium-high heat until very hot.")
    expect(rows).toHaveLength(0)
  })

  test("preheat instruction with temperature is filtered out", () => {
    const rows = parse("Preheat oven to 375°F.")
    expect(rows).toHaveLength(0)
  })

  test("multi-step paragraph extracts embedded ingredients", () => {
    // "and 1 tablespoon lemon juice" follows "olive oil" — trimName strips " and 1..."
    // leaving olive oil. Lemon juice is consumed inside the first match's name group.
    const text = [
      "Prepare the chicken breasts by pounding to 1/2 inch thickness.",
      "Season both sides with 1 tsp salt and 1/2 tsp black pepper.",
      "In a bowl mix 2 tablespoons olive oil and 1 tablespoon lemon juice.",
    ].join(" ")

    const rows = parse(text)
    const names = rows.map((r) => r.name)
    expect(names).toContain("salt")
    expect(names).toContain("black pepper")
    expect(names).toContain("olive oil")
    // Note: "lemon juice" is consumed by the olive oil match's name group
    // and trimmed by trimName(" and 1 tablespoon lemon juice") → not separately extracted.
  })
})

// ── 3. Step markers and numbered lists ───────────────────────────────────────

describe("Step markers stripped", () => {
  test("numbered list marker stripped before parse", () => {
    const rows = parse("1. 2 cups all-purpose flour\n2. 1 tsp baking powder")
    const flour = rows.find((r) => r.name.includes("flour"))
    expect(flour?.quantity).toBe(2)
    expect(flour?.unit).toBe("cups")
    expect(flour?.name).toBe("all-purpose flour")
  })

  test("'Step N:' prefix stripped — name captures up to sentence-end punctuation", () => {
    // After stripping "Step 1:", sentence is "Add 3 tbsp olive oil to the pan."
    // scanEmbedded captures "olive oil to the pan" as the name (greedy, stops at period).
    const rows = parse("Step 1: Add 3 tbsp olive oil to the pan.")
    const oil = rows.find((r) => r.name.startsWith("olive oil"))
    expect(oil).toBeDefined()
    expect(oil?.quantity).toBe(3)
    expect(oil?.unit).toBe("tbsp")
  })

  test("bullet markers stripped", () => {
    const rows = parse("- 1 cup milk\n• 2 eggs\n* 1/2 tsp vanilla")
    const milk = rows.find((r) => r.name === "milk")
    expect(milk?.quantity).toBe(1)
    expect(milk?.unit).toBe("cup")
  })

  test("bare step numbers are dropped", () => {
    const rows = parse("1\n2 cups flour\n3")
    expect(rows.every((r) => r.name !== "")).toBe(true)
    const flour = rows.find((r) => r.name === "flour")
    expect(flour).toBeDefined()
  })
})

// ── 4. ALL-CAPS and colon-header filtering ────────────────────────────────────

describe("Section header filtering", () => {
  test("ALL CAPS header without digits is dropped", () => {
    const rows = parse("INGREDIENTS\n2 cups flour")
    const names = rows.map((r) => r.name)
    expect(names).not.toContain("INGREDIENTS")
    expect(names).toContain("flour")
  })

  test("colon-ending header is dropped", () => {
    const rows = parse("For the sauce:\n1 cup chicken broth")
    const names = rows.map((r) => r.name)
    expect(names).not.toContain("For the sauce:")
    expect(names).toContain("chicken broth")
  })

  test("hash-prefixed line is dropped", () => {
    const rows = parse("# Wet ingredients\n1/2 cup milk")
    const names = rows.map((r) => r.name)
    expect(names).not.toContain("Wet ingredients")
    expect(names).toContain("milk")
  })
})

// ── 5. Deduplication ──────────────────────────────────────────────────────────

describe("Deduplication", () => {
  test("same qty+unit+name from multiple steps appears once", () => {
    const text = [
      "Add 2 tablespoons butter.",
      "Remove from heat.",
      "Finish with 2 tablespoons butter.",
    ].join("\n")

    const rows = parse(text)
    const butter = rows.filter(
      (r) => r.name === "butter" && r.quantity === 2 && r.unit === "tablespoons"
    )
    expect(butter).toHaveLength(1)
  })

  test("same ingredient with different qty is NOT deduplicated", () => {
    const rows = parse("1 cup milk\n2 cups milk")
    const milk = rows.filter((r) => r.name === "milk")
    expect(milk).toHaveLength(2)
  })
})

// ── 6. "and" conjunction rows (no digit after "and" → name includes "and") ───

describe("'and' conjunction — name-only rows", () => {
  test("'salt and pepper to taste' is name-only with no qty", () => {
    const rows = parse("salt and pepper to taste")
    const row = rows.find((r) => r.name.includes("salt"))
    expect(row?.quantity).toBeNull()
    expect(row?.unit).toBeNull()
    // Name contains "and" so the UI categorize() can flag it for review
    expect(row?.name).toMatch(/\band\b/)
  })

  test("'butter and olive oil' with no qty is name-only", () => {
    const rows = parse("butter and olive oil")
    const row = rows.find((r) => r.name.includes("butter"))
    expect(row?.quantity).toBeNull()
    expect(row?.unit).toBeNull()
    expect(row?.name).toMatch(/\band\b/)
  })

  test("'2 tbsp butter and oil' — qty+unit extracted, 'and oil' stays in name", () => {
    // trimName only removes " and <digit>..." — "oil" is not a digit, so it stays.
    // The extracted name is "butter and oil to the skillet".
    const rows = parse("Add 2 tablespoons butter and oil to the skillet.")
    const butterRow = rows.find((r) => r.name.startsWith("butter") && r.quantity === 2)
    expect(butterRow).toBeDefined()
    expect(butterRow?.unit).toBe("tablespoons")
    // The name includes "and oil" since no digit follows "and"
    expect(butterRow?.name).toMatch(/and oil/)
  })
})

// ── 7. Mixed format (list + prose) ────────────────────────────────────────────

describe("Mixed list and prose", () => {
  const MIXED = `
Ingredients:
2 lbs chicken breast
1 cup heavy cream
3 cloves garlic

Instructions:
Step 1: Preheat oven to 375°F.
Step 2: Season the chicken with 1 tsp salt and 1/2 tsp pepper.
Step 3: In a saucepan combine the heavy cream with 2 tablespoons butter.
`.trim()

  test("ingredients from structured list are extracted", () => {
    const rows = parse(MIXED)
    const names = rows.map((r) => r.name)
    expect(names).toContain("chicken breast")
    expect(names).toContain("heavy cream")
  })

  test("ingredients embedded in instructions are extracted", () => {
    const rows = parse(MIXED)
    const salt = rows.find((r) => r.name === "salt")
    expect(salt?.quantity).toBe(1)
    expect(salt?.unit).toBe("tsp")
    const butter = rows.find((r) => r.name.startsWith("butter"))
    expect(butter?.quantity).toBe(2)
    expect(butter?.unit).toBe("tablespoons")
  })

  test("section headers 'Ingredients:' and 'Instructions:' are dropped", () => {
    const rows = parse(MIXED)
    const names = rows.map((r) => r.name)
    expect(names).not.toContain("Ingredients:")
    expect(names).not.toContain("Instructions:")
  })

  test("pure preheat instruction is filtered", () => {
    const rows = parse(MIXED)
    const names = rows.map((r) => r.name)
    expect(names.some((n) => n.toLowerCase().includes("preheat"))).toBe(false)
  })
})

// ── 8. Edge cases ─────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  test("empty input returns empty array", () => {
    expect(parse("")).toHaveLength(0)
    expect(parse("   \n   \n  ")).toHaveLength(0)
  })

  test("all-header block returns empty array", () => {
    const rows = parse("INGREDIENTS\nFor the sauce:\n# Section")
    expect(rows).toHaveLength(0)
  })

  test("no-space number+unit", () => {
    const rows = parse("500ml water")
    const water = rows.find((r) => r.name === "water")
    expect(water?.quantity).toBe(500)
    expect(water?.unit).toBe("ml")
  })

  test("zero denominator in fraction does not throw", () => {
    expect(() => parse("1/0 cups water")).not.toThrow()
  })

  test("decimal quantity in instruction sentence is extracted correctly", () => {
    // Name captures up to period: "milk to the mixture" (greedy name group stops at ".")
    const rows = parse("Add 1.5 cups milk to the mixture.")
    const milk = rows.find((r) => r.name.startsWith("milk"))
    expect(milk).toBeDefined()
    expect(milk?.quantity).toBeCloseTo(1.5)
    expect(milk?.unit).toBe("cups")
  })
})
