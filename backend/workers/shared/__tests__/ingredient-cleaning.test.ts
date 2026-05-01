import { describe, it, expect } from "vitest"
import {
  cleanRecipeIngredientName,
  cleanScraperProductName,
  cleanIngredientByContext,
  hoistProductType,
  buildUnitStripRegexes,
} from "../ingredient-cleaning"

describe("cleanRecipeIngredientName", () => {
  it("strips preparation words", () => {
    // "finely" is an adverb, not in the regex; "chopped" and "fresh" are stripped
    expect(cleanRecipeIngredientName("finely chopped fresh parsley")).toBe("finely parsley")
  })

  it("strips multiple preparation words", () => {
    expect(cleanRecipeIngredientName("large organic yellow onion diced")).toBe("yellow onion")
  })

  it("strips optional phrases", () => {
    expect(cleanRecipeIngredientName("kosher salt to taste")).toBe("kosher salt")
  })

  it("strips divided", () => {
    expect(cleanRecipeIngredientName("olive oil divided")).toBe("olive oil")
  })

  it("strips plus more", () => {
    expect(cleanRecipeIngredientName("olive oil, plus more")).toBe("olive oil")
  })

  it("strips trailing packaging noise", () => {
    expect(cleanRecipeIngredientName("heavy cream 8 oz")).toBe("heavy cream")
  })

  it("preserves meaningful variety words", () => {
    // "boneless"/"skinless" are not in the prep regex; "chicken breast" and modifiers survive
    expect(cleanRecipeIngredientName("boneless skinless chicken breast")).toBe(
      "boneless skinless chicken breast"
    )
  })

  it("does NOT hoist product types", () => {
    expect(cleanRecipeIngredientName("Red Bell Pepper Cream Cheese Spread")).toBe(
      "red bell pepper cream cheese spread"
    )
  })

  it("does NOT strip packing medium", () => {
    expect(cleanRecipeIngredientName("tuna in water")).toBe("tuna in water")
  })

  it("lowercases and normalises unicode", () => {
    expect(cleanRecipeIngredientName("Jalapeño")).toBe("jalapeno")
  })

  it("retains core recipe ingredient names after minimal cleaning", () => {
    expect(cleanRecipeIngredientName("grated parmigiano reggiano")).toBe("parmigiano reggiano")
  })
})

describe("cleanScraperProductName", () => {
  it("hoists product type suffix to front", () => {
    // hoistProductType preserves input casing of the captured group
    const result = cleanScraperProductName("Red Bell Pepper, Garlic & Parmesan Cream Cheese Spread 8 Oz")
    expect(result.toLowerCase().startsWith("cream cheese spread")).toBe(true)
  })

  it("strips packing medium", () => {
    const result = cleanScraperProductName("Solid Light Tuna in Extra Virgin Olive Oil 4.5 Oz")
    expect(result.toLowerCase()).not.toContain("in extra virgin olive oil")
    expect(result.toLowerCase()).toContain("tuna")
  })

  it("strips processing qualifier", () => {
    expect(cleanScraperProductName("cold-pressed extra virgin olive oil")).toBe(
      "extra virgin olive oil"
    )
  })

  it("strips stone-ground qualifier", () => {
    expect(cleanScraperProductName("stone-ground whole wheat mustard")).toBe(
      "whole wheat mustard"
    )
  })

  it("does NOT strip preparation words", () => {
    expect(cleanScraperProductName("Roasted Garlic Hummus").toLowerCase()).toContain("roasted")
  })

  it("strips trailing brand suffix (hyphen)", () => {
    // "Whole Milk" has no product-type suffix match so hoistProductType is a no-op here
    expect(cleanScraperProductName("Whole Milk - Good & Gather").toLowerCase()).toBe("whole milk")
  })

  it("strips trailing brand suffix (en-dash)", () => {
    expect(cleanScraperProductName("Extra Virgin Olive Oil – California Olive Ranch").toLowerCase()).toBe(
      "extra virgin olive oil"
    )
  })

  it("hoists string cheese product types", () => {
    const cleaned = cleanScraperProductName("Low-Moisture Part-Skim Mozzarella String Cheese - 12oz/12ct")
    expect(cleaned.toLowerCase()).toMatch(/^string cheese\b/)
    expect(cleaned.toLowerCase()).toContain("mozzarella")
  })

  it("strips compact nutrition label", () => {
    expect(cleanScraperProductName("Coffee Creamer - 14g Protein").toLowerCase()).toBe("coffee creamer")
  })

  it("strips trailing pack descriptor", () => {
    expect(cleanScraperProductName("Large Eggs - 6 pack").toLowerCase()).toBe("large eggs")
  })

  it("strips trailing separator+unit block with dynamic keywords (pass 2)", () => {
    const unitRegexes = buildUnitStripRegexes(["oz"])
    expect(cleanScraperProductName("Heavy Cream - 32oz", unitRegexes).toLowerCase()).toBe("heavy cream")
  })

  it("strips fused mid-string unit with dynamic keywords (pass 4b)", () => {
    // "olive oil" has no product-type suffix match so hoistProductType is a no-op here
    const unitRegexes = buildUnitStripRegexes(["oz"])
    expect(cleanScraperProductName("Olive Oil 16oz Extra Virgin", unitRegexes).toLowerCase()).toBe(
      "olive oil"
    )
  })

  it("hoists baby puffs titles so the product type stays visible", () => {
    const title =
      "Little Spoon Organic Kale Apple Curl Baby Puffs – 1oz: Age 6 Months & Up, Toddler Stage, Bag, Ready to Eat"

    expect(hoistProductType(title)).toMatch(/^baby puffs /i)
    expect(cleanScraperProductName(title)).toMatch(/^baby puffs /i)
    expect(cleanScraperProductName(title)).not.toMatch(/^kale\b/i)
  })

  it("strips trademarked brand suffixes from scraper titles", () => {
    const title = "Extra Cream Heavy Whipping Cream - 16 fl oz - Good & Gather™"

    const cleaned = cleanScraperProductName(title)

    expect(cleaned).not.toContain("good & gather")
    expect(cleaned).not.toContain("™")
    expect(cleaned.toLowerCase()).toContain("heavy whipping cream")
  })

  it("removes carrier medium noise from scraper titles", () => {
    const title = "Spice World Minced Garlic in Extra Virgin Olive Oil 4.5 oz"

    expect(cleanScraperProductName(title)).toBe("Spice World Minced Garlic")
  })
})

// Real low-confidence rows from product_mappings (ingredient_confidence < 0.65).
// SQL cleaning lowercases and strips ™/® before TypeScript sees the name.
describe("cleanScraperProductName — real low-confidence product mappings", () => {
  it("strips integer unit suffix (Good & Gather fresh raspberries, was mapped to 'freeze dried raspberry' at 0.41)", () => {
    // SQL-cleaned from: "Fresh Raspberries - 6oz"
    // BRAND_SUFFIX_RE strips " - 6oz" (integer, no decimal)
    expect(cleanScraperProductName("fresh raspberries - 6oz")).toBe("fresh raspberries")
  })

  it("strips decimal unit suffix via dynamic keywords (fresh blueberries, was mapped to 'blueberry pastries' at 0.42)", () => {
    // SQL-cleaned from: "Fresh Blueberries - 11.2oz"
    // BRAND_SUFFIX_RE cannot match "11.2oz" (decimal point breaks [a-z0-9 &'])
    // trailingSeparatorUnit handles the decimal case
    const unitRegexes = buildUnitStripRegexes(["oz"])
    expect(cleanScraperProductName("fresh blueberries - 11.2oz", unitRegexes)).toBe("fresh blueberries")
  })

  it("chains brand suffix then weight suffix (Good & Gather onions, confidence 0.40)", () => {
    // SQL-cleaned from: "Fresh Yellow Onions - 3lb Bag - Good & Gather™"
    // Pass 1: BRAND_SUFFIX_RE strips " - good & gather"
    // Pass 2: trailingSeparatorUnit strips " - 3lb bag"
    const unitRegexes = buildUnitStripRegexes(["lb", "lbs", "oz"])
    expect(cleanScraperProductName("fresh yellow onions - 3lb bag - good & gather", unitRegexes)).toBe(
      "fresh yellow onions"
    )
  })

  it("strips pack count then unit (Badia spice 12-pack, confidence 0.58)", () => {
    // From: "Badia Minced Garlic Lemon Basil Spice - 12 pack, 8 oz"
    // trailingSeparatorUnit strips ", 8 oz"; TRAILING_PACK_DESCRIPTOR_RE strips " - 12 pack"
    const unitRegexes = buildUnitStripRegexes(["oz"])
    expect(
      cleanScraperProductName("Badia Minced Garlic Lemon Basil Spice - 12 pack, 8 oz", unitRegexes).toLowerCase()
    ).toBe("badia minced garlic lemon basil spice")
  })

  it("strips simple measurement suffix without unit keywords (Applegate bacon, confidence 0.58)", () => {
    // From: "Applegate Natural Uncured Sunday Bacon - 8oz"
    // BRAND_SUFFIX_RE alone handles this — no dynamic keywords needed
    expect(cleanScraperProductName("applegate natural uncured sunday bacon - 8oz")).toBe(
      "applegate natural uncured sunday bacon"
    )
  })
})

describe("hoistProductType", () => {
  it("moves product type to front (preserves input casing)", () => {
    expect(hoistProductType("Honey Wheat Sandwich Bread 20 oz")).toBe(
      "Sandwich Bread Honey Wheat 20 oz"
    )
  })

  it("returns name unchanged when no product type suffix found", () => {
    expect(hoistProductType("olive oil")).toBe("olive oil")
  })

  it("handles yogurt suffix (preserves input casing)", () => {
    const result = hoistProductType("Strawberry Banana Greek Yogurt 32 oz")
    expect(result.toLowerCase().startsWith("greek yogurt")).toBe(true)
  })
})

describe("cleanIngredientByContext", () => {
  it("routes recipe to recipe cleaner", () => {
    // "chopped" is stripped; "finely" (adverb) is not in the prep regex
    expect(cleanIngredientByContext("finely chopped parsley", "recipe")).toBe("finely parsley")
  })

  it("routes pantry to recipe cleaner", () => {
    expect(cleanIngredientByContext("diced yellow onion", "pantry")).toBe("yellow onion")
  })

  it("routes scraper to scraper cleaner", () => {
    const result = cleanIngredientByContext("cold-pressed extra virgin olive oil", "scraper")
    expect(result).toBe("extra virgin olive oil")
  })

  it("scraper path does not strip prep words", () => {
    const result = cleanIngredientByContext("Roasted Garlic Hummus 10 oz", "scraper")
    expect(result.toLowerCase()).toContain("roasted")
  })
})
