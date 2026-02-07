#!/usr/bin/env tsx

import { createServerClient, type Database } from "../lib/database/supabase"

const SUPABASE_SEED_AUTHOR_ID = process.env.SUPABASE_SEED_AUTHOR_ID
const DRY_RUN = process.argv.includes("--dry-run")

if (!SUPABASE_SEED_AUTHOR_ID) {
  console.error("Missing SUPABASE_SEED_AUTHOR_ID. Set it to a valid profiles.id before running this script.")
  process.exit(1)
}

const RPC_NAME = "fn_upsert_recipe_with_ingredients"

// Reuse Supabase enum types so the mock data stays valid.
type CuisineType = Database["public"]["Enums"]["cuisine_type_enum"]
type MealType = Database["public"]["Enums"]["meal_type_enum"]
type ProteinType = Database["public"]["Enums"]["protein_type_enum"]
type DifficultyLevel = Database["public"]["Enums"]["recipe_difficulty"]
type RecipeTag = Database["public"]["Enums"]["tags_enum"]

type MockIngredient = {
  name: string
  quantity?: number
  unit?: string
  standardizedIngredientId?: string | null
}

type MockRecipe = {
  recipeId: string
  title: string
  cuisine: CuisineType
  mealType: MealType
  protein: ProteinType
  difficulty: DifficultyLevel
  servings: number
  prepTime: number
  cookTime: number
  tags: RecipeTag[]
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  description: string
  imageUrl?: string
  instructions: string[]
  ingredients: MockIngredient[]
}

const MOCK_RECIPES: MockRecipe[] = [
  {
    recipeId: "2bd4c9c0-1d7b-4c12-9aee-8a7c0697baca",
    title: "Smoky Chipotle Chicken Tacos",
    cuisine: "mexican",
    mealType: "dinner",
    protein: "chicken",
    difficulty: "intermediate",
    servings: 4,
    prepTime: 15,
    cookTime: 20,
    tags: ["contains-dairy"],
    nutrition: {
      calories: 540,
      protein: 38,
      carbs: 44,
      fat: 22,
    },
    description: "Charred chipotle chicken tucked into grilled corn tortillas with lime, cilantro, and pickled onions.",
    imageUrl: "https://images.unsplash.com/photo-1528701800489-20fcfd7f5de5?auto=format&fit=crop&w=800&q=80",
    instructions: [
      "Whisk chipotle peppers, lime juice, olive oil, garlic, and oregano in a bowl, then marinate the chicken for at least 15 minutes.",
      "Sear the chicken on medium-high heat until cooked through, about 4-5 minutes per side, then let it rest before slicing.",
      "Warm tortillas over an open flame or skillet, then assemble tacos with sliced chicken, cilantro, pickled onions, and cotija.",
      "Finish with a squeeze of lime and a drizzle of crema.",
    ],
    ingredients: [
      { name: "boneless skinless chicken thighs", quantity: 1.25, unit: "lb" },
      { name: "chipotle peppers in adobo", quantity: 2, unit: "tbsp" },
      { name: "fresh lime juice", quantity: 2, unit: "tbsp" },
      { name: "extra virgin olive oil", quantity: 2, unit: "tbsp" },
      { name: "garlic cloves", quantity: 3, unit: "clove" },
      { name: "corn tortillas", quantity: 8, unit: "count" },
      { name: "fresh cilantro", quantity: 0.5, unit: "cup" },
      { name: "red onion", quantity: 0.25, unit: "cup" },
      { name: "cotija cheese", quantity: 0.25, unit: "cup" },
    ],
  },
  {
    recipeId: "a9d6be53-b640-4dba-8f6a-0a7b36bf35f5",
    title: "Mediterranean Chickpea Bowl",
    cuisine: "mediterranean",
    mealType: "lunch",
    protein: "legume",
    difficulty: "beginner",
    servings: 3,
    prepTime: 20,
    cookTime: 10,
    tags: ["vegetarian", "gluten-free"],
    nutrition: {
      calories: 420,
      protein: 18,
      carbs: 52,
      fat: 16,
    },
    description: "A bright bowl packed with chickpeas, quinoa, charred veg, and a lemon-tahini dressing.",
    imageUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Cook quinoa according to package directions and fluff with a fork.",
      "Toss cherry tomatoes, zucchini, and bell pepper with olive oil, salt, and pepper; roast until tender and slightly charred.",
      "Whisk tahini, lemon juice, garlic, smoked paprika, and warm water to make a drizzling dressing.",
      "Layer quinoa, roasted vegetables, chickpeas, and spinach in bowls, then finish with dressing and a sprinkle of za'atar.",
    ],
    ingredients: [
      { name: "cooked quinoa", quantity: 1, unit: "cup" },
      { name: "canned chickpeas", quantity: 1.5, unit: "cup" },
      { name: "cherry tomatoes", quantity: 1, unit: "cup" },
      { name: "zucchini", quantity: 1, unit: "each" },
      { name: "red bell pepper", quantity: 1, unit: "each" },
      { name: "baby spinach", quantity: 2, unit: "cup" },
      { name: "extra virgin olive oil", quantity: 3, unit: "tbsp" },
      { name: "lemon juice", quantity: 3, unit: "tbsp" },
      { name: "tahini", quantity: 2, unit: "tbsp" },
      { name: "smoked paprika", quantity: 1, unit: "tsp" },
    ],
  },
  {
    recipeId: "f3d2cbd5-5b4a-4ceb-bc25-f3a7d68a847c",
    title: "Ginger Miso Salmon",
    cuisine: "japanese",
    mealType: "dinner",
    protein: "fish",
    difficulty: "intermediate",
    servings: 2,
    prepTime: 10,
    cookTime: 15,
    tags: ["contains-soy", "contains-gluten"],
    nutrition: {
      calories: 610,
      protein: 45,
      carbs: 18,
      fat: 32,
    },
    description: "Soy-miso glazed salmon roasted with ginger and sesame for a quick weeknight dinner.",
    imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Whisk miso paste, soy sauce, honey, rice vinegar, ginger, and sesame oil into a glossy glaze.",
      "Brush the glaze over salmon fillets and let marinate for 10 minutes.",
      "Bake the salmon at 425°F (220°C) for 10-12 minutes until just cooked through, then broil for 1-2 minutes to caramelize.",
      "Garnish with sliced scallions and toasted sesame seeds before serving.",
    ],
    ingredients: [
      { name: "salmon fillets", quantity: 1.25, unit: "lb" },
      { name: "white miso paste", quantity: 2, unit: "tbsp" },
      { name: "low sodium soy sauce", quantity: 3, unit: "tbsp" },
      { name: "honey", quantity: 1.5, unit: "tbsp" },
      { name: "rice vinegar", quantity: 1, unit: "tbsp" },
      { name: "fresh ginger", quantity: 1, unit: "tbsp" },
      { name: "sesame oil", quantity: 1, unit: "tsp" },
      { name: "scallions", quantity: 2, unit: "stalk" },
    ],
  },
]

async function main(): Promise<void> {
  const supabase = createServerClient()
  let succeeded = 0

  for (const recipe of MOCK_RECIPES) {
    const ingredientsPayload = recipe.ingredients
      .map((ingredient) => ({
        display_name: ingredient.name.trim(),
        standardized_ingredient_id: ingredient.standardizedIngredientId ?? null,
        quantity: ingredient.quantity ?? null,
        units: ingredient.unit ?? null,
      }))
      .filter((ingredient) => Boolean(ingredient.display_name))

    const payload = {
      p_recipe_id: recipe.recipeId,
      p_title: recipe.title,
      p_author_id: SUPABASE_SEED_AUTHOR_ID,
      p_cuisine: recipe.cuisine,
      p_meal_type: recipe.mealType,
      p_protein: recipe.protein,
      p_difficulty: recipe.difficulty,
      p_servings: recipe.servings,
      p_prep_time: recipe.prepTime,
      p_cook_time: recipe.cookTime,
      p_tags: recipe.tags,
      p_nutrition: recipe.nutrition,
      p_description: recipe.description,
      p_image_url: recipe.imageUrl ?? null,
      p_instructions: recipe.instructions,
      p_ingredients: ingredientsPayload,
    }

    if (DRY_RUN) {
      console.log(`[seed-mock-recipes] Dry run would upsert:
${JSON.stringify(payload, null, 2)}`)
      continue
    }

    const { data, error } = await supabase.rpc(RPC_NAME, payload)
    if (error) {
      console.error(`[seed-mock-recipes] Failed to upsert ${recipe.title}:`, error.message)
      continue
    }

    succeeded += 1
    console.log(`[seed-mock-recipes] Upserted ${data?.title ?? recipe.title} (${data?.id})`)
  }

  console.log(`\n[seed-mock-recipes] Completed ${succeeded}/${MOCK_RECIPES.length} recipes.${DRY_RUN ? " (dry run only)" : ""}`)
}

void main().catch((error) => {
  console.error("[seed-mock-recipes] Unexpected error:", error)
  process.exit(1)
})
