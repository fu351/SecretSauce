import { parseIngredientLine, parseIngredientParagraph } from "./ingredient-parser"
import unitKeywords from "@/test/fixtures/unit-keywords.json"

// Shorthand so test lines stay readable
const parse = (line: string) => parseIngredientLine(line, unitKeywords)

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1: decimal/integer + known unit keyword
// ─────────────────────────────────────────────────────────────────────────────
describe("Pass 1: decimal/integer + known unit", () => {
  test("integer qty with space before unit", () => {
    expect(parse("2 cups flour")).toMatchObject({ quantity: 2, unit: "cups", name: "flour" })
  })

  test("decimal qty", () => {
    expect(parse("1.5 oz parmesan")).toMatchObject({ quantity: 1.5, unit: "oz", name: "parmesan" })
  })

  test("no space between number and unit", () => {
    expect(parse("500ml water")).toMatchObject({ quantity: 500, unit: "ml", name: "water" })
  })

  test("tbsp unit", () => {
    expect(parse("3 tbsp olive oil")).toMatchObject({ quantity: 3, unit: "tbsp", name: "olive oil" })
  })

  test("lb unit", () => {
    expect(parse("1 lb ground beef")).toMatchObject({ quantity: 1, unit: "lb", name: "ground beef" })
  })

  test("cloves unit (plural)", () => {
    expect(parse("2 cloves garlic")).toMatchObject({ quantity: 2, unit: "cloves", name: "garlic" })
  })

  test("multi-word ingredient name", () => {
    expect(parse("2 cups all-purpose flour")).toMatchObject({
      quantity: 2,
      unit: "cups",
      name: "all-purpose flour",
    })
  })

  test("unit with uppercase in input is lowercased", () => {
    const r = parse("2 Cups flour")
    expect(r.unit).toBe("cups")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2: mixed fraction + known unit keyword
// ─────────────────────────────────────────────────────────────────────────────
describe("Pass 2: mixed fraction + known unit", () => {
  test("1 1/2 cups milk", () => {
    const r = parse("1 1/2 cups milk")
    expect(r.quantity).toBeCloseTo(1.5)
    expect(r.unit).toBe("cups")
    expect(r.name).toBe("milk")
  })

  test("2 3/4 oz cheese", () => {
    const r = parse("2 3/4 oz cheese")
    expect(r.quantity).toBeCloseTo(2.75)
    expect(r.unit).toBe("oz")
    expect(r.name).toBe("cheese")
  })

  test("1 1/3 cups sugar", () => {
    expect(parse("1 1/3 cups sugar").quantity).toBeCloseTo(1.333)
  })

  test("whole + fraction adds correctly", () => {
    const r = parse("3 1/4 tsp baking powder")
    expect(r.quantity).toBeCloseTo(3.25)
    expect(r.unit).toBe("tsp")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Pass 3: plain fraction + known unit keyword
// ─────────────────────────────────────────────────────────────────────────────
describe("Pass 3: plain fraction + known unit", () => {
  test("3/4 tsp salt", () => {
    const r = parse("3/4 tsp salt")
    expect(r.quantity).toBeCloseTo(0.75)
    expect(r.unit).toBe("tsp")
    expect(r.name).toBe("salt")
  })

  test("1/3 cup sugar", () => {
    expect(parse("1/3 cup sugar").quantity).toBeCloseTo(0.333)
  })

  test("1/2 lb ground beef", () => {
    const r = parse("1/2 lb ground beef")
    expect(r.quantity).toBeCloseTo(0.5)
    expect(r.unit).toBe("lb")
    expect(r.name).toBe("ground beef")
  })

  test("2/3 cup buttermilk", () => {
    const r = parse("2/3 cup buttermilk")
    expect(r.quantity).toBeCloseTo(0.667)
    expect(r.unit).toBe("cup")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Pass 4: each fallback (integer/decimal, no recognized unit)
// ─────────────────────────────────────────────────────────────────────────────
describe("Pass 4: each fallback (no recognized unit)", () => {
  test("2 eggs", () => {
    expect(parse("2 eggs")).toMatchObject({ quantity: 2, unit: "each", name: "eggs" })
  })

  test("1 onion, diced", () => {
    expect(parse("1 onion, diced")).toMatchObject({ quantity: 1, unit: "each", name: "onion, diced" })
  })

  test("3 carrots", () => {
    expect(parse("3 carrots")).toMatchObject({ quantity: 3, unit: "each", name: "carrots" })
  })

  test("decimal quantity with no unit", () => {
    // 1.5 avocados — no unit keyword, each fallback
    const r = parse("1.5 avocados")
    expect(r.quantity).toBeCloseTo(1.5)
    expect(r.unit).toBe("each")
    expect(r.name).toBe("avocados")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Pass 5: no quantity detected
// ─────────────────────────────────────────────────────────────────────────────
describe("Pass 5: no quantity", () => {
  test("salt to taste", () => {
    expect(parse("salt to taste")).toMatchObject({
      quantity: null,
      unit: null,
      name: "salt to taste",
    })
  })

  test("fresh parsley for garnish", () => {
    expect(parse("fresh parsley for garnish")).toMatchObject({ quantity: null, unit: null })
  })

  test("single word ingredient", () => {
    expect(parse("pepper")).toMatchObject({ quantity: null, unit: null, name: "pepper" })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// List marker stripping
// ─────────────────────────────────────────────────────────────────────────────
describe("List marker stripping", () => {
  test("numeric dot marker: 1. 2 cups flour", () => {
    expect(parse("1. 2 cups flour")).toMatchObject({ quantity: 2, unit: "cups", name: "flour" })
  })

  test("numeric paren marker: 2) 1 tsp vanilla", () => {
    expect(parse("2) 1 tsp vanilla")).toMatchObject({ quantity: 1, unit: "tsp", name: "vanilla" })
  })

  test("dash marker: - 3/4 cup buttermilk", () => {
    expect(parse("- 3/4 cup buttermilk")).toMatchObject({ unit: "cup", name: "buttermilk" })
  })

  test("asterisk marker: * 2 eggs", () => {
    expect(parse("* 2 eggs")).toMatchObject({ quantity: 2, unit: "each", name: "eggs" })
  })

  test("bullet marker: • 1 lb beef", () => {
    expect(parse("• 1 lb beef")).toMatchObject({ quantity: 1, unit: "lb", name: "beef" })
  })

  test("blank line after stripping returns empty name", () => {
    const r = parse("- ")
    expect(r.name).toBe("")
    expect(r.quantity).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Fraction ordering guards
// ─────────────────────────────────────────────────────────────────────────────
describe("Fraction ordering guards", () => {
  test("mixed fraction not parsed as integer + separate fraction", () => {
    // "1 1/2 cups" must yield qty 1.5, not qty 1 with name "1/2 cups"
    const r = parse("1 1/2 cups milk")
    expect(r.quantity).toBeCloseTo(1.5)
    expect(r.name).toBe("milk")
  })

  test("Pass 4 guard: fraction after integer does not fire each-fallback", () => {
    // If Pass 2 matched, this won't reach Pass 4. If the input is malformed
    // ("1 1/2" with no unit), Pass 4 should NOT treat "1/2" as a name.
    const r = parse("1 1/2 cups milk")
    // Confirm it did not parse as { quantity: 1, unit: 'each', name: '1/2 cups milk' }
    expect(r.quantity).not.toBe(1)
    expect(r.unit).not.toBe("each")
  })

  test("zero denominator guard does not throw", () => {
    expect(() => parse("1/0 cups water")).not.toThrow()
  })

  test("plain fraction not confused with mixed fraction", () => {
    // "3/4 tsp" should parse as qty 0.75, not as integer 3 → each
    const r = parse("3/4 tsp salt")
    expect(r.quantity).toBeCloseTo(0.75)
    expect(r.unit).toBe("tsp")
  })

  test("bad fraction (1/0) does not produce a result with unit", () => {
    // Should not crash and should not produce a parsed unit row
    const r = parse("1/0 cups water")
    // Falls through to Pass 5 (fraction, but zero denominator guard)
    // or Pass 4 (also won't fire since it starts with digits and slash)
    expect(r.quantity).toBeNull()
    expect(r.unit).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Unit vocabulary edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe("Unit vocabulary edge cases", () => {
  test("two-word unit: fl oz", () => {
    expect(parse("8 fl oz water")).toMatchObject({ quantity: 8, unit: "fl oz", name: "water" })
  })

  test("dz abbreviation", () => {
    expect(parse("1 dz eggs")).toMatchObject({ quantity: 1, unit: "dz", name: "eggs" })
  })

  test("bunch unit", () => {
    expect(parse("1 bunch cilantro")).toMatchObject({ quantity: 1, unit: "bunch", name: "cilantro" })
  })

  test("g unit (single char)", () => {
    expect(parse("100 g butter")).toMatchObject({ quantity: 100, unit: "g", name: "butter" })
  })

  test("tsp matches before t (no single-char 't' in vocabulary)", () => {
    const r = parse("1 tsp salt")
    expect(r.unit).toBe("tsp")
    expect(r.name).toBe("salt")
  })

  test("longest unit wins (tablespoons before tbsp)", () => {
    const r = parse("2 tablespoons olive oil")
    expect(r.unit).toBe("tablespoons")
    expect(r.name).toBe("olive oil")
  })

  test("product-name entries not treated as unit keywords", () => {
    // "avocado oil spray" is NOT in the fixture (excluded by SQL RPC anti-join).
    // If someone types "1 avocado oil spray", the unit should not be
    // "avocado oil spray" — it should fall to the each-fallback.
    const r = parse("1 avocado oil spray")
    expect(r.unit).toBe("each")
    expect(r.name).toContain("avocado")
  })

  test("empty unit keyword list returns name-only", () => {
    const r = parseIngredientLine("2 cups flour", [])
    expect(r.quantity).toBeNull()
    expect(r.unit).toBeNull()
    expect(r.name).toBe("2 cups flour")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// raw field preservation
// ─────────────────────────────────────────────────────────────────────────────
describe("raw field", () => {
  test("raw preserves original line including list marker", () => {
    const r = parse("1. 2 cups flour")
    expect(r.raw).toBe("1. 2 cups flour")
  })

  test("raw preserves leading/trailing whitespace of original", () => {
    const r = parseIngredientLine("  salt to taste  ", unitKeywords)
    expect(r.raw).toBe("  salt to taste  ")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// parseIngredientParagraph
// ─────────────────────────────────────────────────────────────────────────────
describe("parseIngredientParagraph", () => {
  const block = [
    "2 cups all-purpose flour",
    "1 1/2 tsp baking powder",
    "3/4 cup whole milk",
    "2 large eggs",
    "salt to taste",
  ].join("\n")

  test("parses a 5-line block correctly", () => {
    const rows = parseIngredientParagraph(block, unitKeywords)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toMatchObject({ quantity: 2, unit: "cups", name: "all-purpose flour" })
    expect(rows[1].quantity).toBeCloseTo(1.5)
    expect(rows[1].unit).toBe("tsp")
    expect(rows[2].quantity).toBeCloseTo(0.75)
    expect(rows[2].unit).toBe("cup")
    expect(rows[3]).toMatchObject({ quantity: 2, unit: "each", name: "large eggs" })
    expect(rows[4]).toMatchObject({ quantity: null, unit: null, name: "salt to taste" })
  })

  test("blank lines are skipped", () => {
    const rows = parseIngredientParagraph("2 cups flour\n\n1 tsp salt", unitKeywords)
    expect(rows).toHaveLength(2)
  })

  test("lines starting with # are skipped", () => {
    const rows = parseIngredientParagraph(
      "# Dry ingredients\n2 cups flour\n1 tsp salt",
      unitKeywords
    )
    expect(rows).toHaveLength(2)
  })

  test("mixed blank lines and comment lines", () => {
    const text = "# Wet\n\n2 large eggs\n\n# Dry\n1 cup flour"
    const rows = parseIngredientParagraph(text, unitKeywords)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ quantity: 2, unit: "each", name: "large eggs" })
    expect(rows[1]).toMatchObject({ quantity: 1, unit: "cup", name: "flour" })
  })

  test("returns empty array for blank input", () => {
    expect(parseIngredientParagraph("", unitKeywords)).toHaveLength(0)
    expect(parseIngredientParagraph("   \n\n  ", unitKeywords)).toHaveLength(0)
  })

  test("numbered list is parsed correctly", () => {
    const text = "1. 2 cups flour\n2. 1 tsp salt\n3. 3 eggs"
    const rows = parseIngredientParagraph(text, unitKeywords)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ quantity: 2, unit: "cups" })
    expect(rows[1]).toMatchObject({ quantity: 1, unit: "tsp" })
    expect(rows[2]).toMatchObject({ quantity: 3, unit: "each" })
  })
})
