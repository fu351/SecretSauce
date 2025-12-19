type TagResult = {
  dietary_flags: {
    contains_dairy: boolean
    contains_gluten: boolean
    contains_nuts: boolean
    contains_shellfish: boolean
    contains_egg: boolean
    contains_soy: boolean
  }
  protein_tag: string
  cuisine_guess?: string | null
  meal_type_guess?: string | null
}

const dairyTerms = [
  "milk",
  "cheese",
  "mozzarella",
  "parmesan",
  "cheddar",
  "cream",
  "butter",
  "yogurt",
  "paneer",
]
const glutenTerms = ["wheat", "flour", "breadcrumbs", "barley", "rye", "pasta", "noodle", "cracker", "bread"]
const nutTerms = ["almond", "cashew", "peanut", "walnut", "pecan", "hazelnut", "pistachio"]
const shellfishTerms = ["shrimp", "prawn", "crab", "lobster", "mussel", "clam", "oyster", "scallop"]
const soyTerms = ["soy", "tofu", "tempeh", "edamame", "miso", "soya"]
const eggTerms = ["egg", "mayonnaise", "mayo"]

const proteinMap: Array<{ tag: string; keywords: string[] }> = [
  { tag: "chicken", keywords: ["chicken"] },
  { tag: "beef", keywords: ["beef", "steak"] },
  { tag: "pork", keywords: ["pork", "bacon"] },
  { tag: "fish", keywords: ["fish", "salmon", "cod", "tilapia", "tuna"] },
  { tag: "shellfish", keywords: ["shrimp", "prawn", "crab", "lobster", "mussel", "clam", "oyster", "scallop"] },
  { tag: "turkey", keywords: ["turkey"] },
  { tag: "tofu", keywords: ["tofu", "tempeh"] },
  { tag: "legume", keywords: ["bean", "lentil", "chickpea", "black beans", "kidney bean"] },
  { tag: "egg", keywords: ["egg"] },
]

const cuisineHints: Array<{ cuisine: string; keywords: string[] }> = [
  { cuisine: "mexican", keywords: ["tortilla", "salsa", "cilantro", "taco", "enchilada"] },
  { cuisine: "italian", keywords: ["basil", "mozzarella", "parmesan", "pasta", "oregano"] },
  { cuisine: "asian", keywords: ["soy", "ginger", "sesame", "noodle"] },
  { cuisine: "indian", keywords: ["garam masala", "curry", "tikka", "ghee"] },
  { cuisine: "mediterranean", keywords: ["olive", "feta", "hummus", "tahini"] },
]

const mealTypeHints: Array<{ type: string; keywords: string[] }> = [
  { type: "breakfast", keywords: ["pancake", "waffle", "oatmeal", "cereal", "bagel", "muffin", "scrambled", "omelet", "omelette", "breakfast", "brunch", "granola", "french toast"] },
  { type: "lunch", keywords: ["sandwich", "salad", "wrap", "panini", "soup", "lunch"] },
  { type: "dinner", keywords: ["steak", "roast", "casserole", "pot roast", "dinner", "supper"] },
]

const includesAny = (haystack: string, terms: string[]) => terms.some((term) => haystack.includes(term))

export function tagRecipeFromIngredients(ingredients: Array<{ name?: string }> = [], title?: string): TagResult {
  const names = ingredients.map((i) => (i.name || "").toLowerCase())
  const joined = names.join(" ")
  const titleLower = (title || "").toLowerCase()

  const dietary_flags = {
    contains_dairy: includesAny(joined, dairyTerms),
    contains_gluten: includesAny(joined, glutenTerms),
    contains_nuts: includesAny(joined, nutTerms),
    contains_shellfish: includesAny(joined, shellfishTerms),
    contains_egg: includesAny(joined, eggTerms),
    contains_soy: includesAny(joined, soyTerms),
  }

  let protein_tag = "other"
  for (const entry of proteinMap) {
    if (includesAny(joined, entry.keywords)) {
      protein_tag = entry.tag
      break
    }
  }

  let cuisine_guess: string | null = null
  for (const entry of cuisineHints) {
    if (includesAny(joined, entry.keywords)) {
      cuisine_guess = entry.cuisine
      break
    }
  }

  let meal_type_guess: string | null = null
  for (const entry of mealTypeHints) {
    if (includesAny(titleLower, entry.keywords) || includesAny(joined, entry.keywords)) {
      meal_type_guess = entry.type
      break
    }
  }

  return { dietary_flags, protein_tag, cuisine_guess, meal_type_guess }
}
