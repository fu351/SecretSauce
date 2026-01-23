/**
 * Utility script to populate standardized ingredients and ingredient mappings
 * Usage: Run this script to batch insert the ingredient data into Supabase
 */

import { createServerClient } from "./database/supabase"

interface StandardizedIngredient {
  canonical_name: string
  category?: string
}

interface IngredientNameMapping {
  original_name: string
  canonical_name: string
}

// Data from the user's JSON
const standardizedIngredientsData: StandardizedIngredient[] = [
  { canonical_name: "all-purpose flour" },
  { canonical_name: "avocado" },
  { canonical_name: "baby spinach" },
  { canonical_name: "baking soda" },
  { canonical_name: "beef sirloin" },
  { canonical_name: "bell pepper" },
  { canonical_name: "black pepper" },
  { canonical_name: "broccoli" },
  { canonical_name: "brown sugar" },
  { canonical_name: "butter" },
  { canonical_name: "chicken breast" },
  { canonical_name: "chickpeas" },
  { canonical_name: "chocolate chips" },
  { canonical_name: "coconut milk" },
  { canonical_name: "cornstarch" },
  { canonical_name: "eggplant" },
  { canonical_name: "eggs" },
  { canonical_name: "fish sauce" },
  { canonical_name: "garlic" },
  { canonical_name: "granulated sugar" },
  { canonical_name: "green beans" },
  { canonical_name: "green curry paste" },
  { canonical_name: "lemon juice" },
  { canonical_name: "maple syrup" },
  { canonical_name: "olive oil" },
  { canonical_name: "onion" },
  { canonical_name: "oyster sauce" },
  { canonical_name: "pancetta" },
  { canonical_name: "pecorino romano cheese" },
  { canonical_name: "quinoa" },
  { canonical_name: "red pepper flakes" },
  { canonical_name: "rice" },
  { canonical_name: "salt" },
  { canonical_name: "salt and pepper" },
  { canonical_name: "soy sauce" },
  { canonical_name: "spaghetti pasta" },
  { canonical_name: "sweet potato" },
  { canonical_name: "tahini" },
  { canonical_name: "thai basil" },
  { canonical_name: "vanilla extract" },
  { canonical_name: "vegetable oil" },
  { canonical_name: "white vinegar" },
  { canonical_name: "whole grain bread" },
]

const ingredientNameMappingsData: IngredientNameMapping[] = [
  { original_name: "all-purpose flour", canonical_name: "all-purpose flour" },
  { original_name: "avocado, sliced", canonical_name: "avocado" },
  { original_name: "baby spinach", canonical_name: "baby spinach" },
  { original_name: "baking soda", canonical_name: "baking soda" },
  { original_name: "beef sirloin, sliced thin", canonical_name: "beef sirloin" },
  { original_name: "bell pepper, sliced", canonical_name: "bell pepper" },
  { original_name: "black pepper, freshly ground", canonical_name: "black pepper" },
  { original_name: "broccoli florets", canonical_name: "broccoli" },
  { original_name: "brown sugar", canonical_name: "brown sugar" },
  { original_name: "brown sugar, packed", canonical_name: "brown sugar" },
  { original_name: "butter, softened", canonical_name: "butter" },
  { original_name: "chicken breast, sliced", canonical_name: "chicken breast" },
  { original_name: "chickpeas, cooked", canonical_name: "chickpeas" },
  { original_name: "chocolate chips", canonical_name: "chocolate chips" },
  { original_name: "coconut milk (14oz)", canonical_name: "coconut milk" },
  { original_name: "cornstarch", canonical_name: "cornstarch" },
  { original_name: "eggplant, cubed", canonical_name: "eggplant" },
  { original_name: "eggs", canonical_name: "eggs" },
  { original_name: "fish sauce", canonical_name: "fish sauce" },
  { original_name: "garlic, minced", canonical_name: "garlic" },
  { original_name: "granulated sugar", canonical_name: "granulated sugar" },
  { original_name: "green beans, trimmed", canonical_name: "green beans" },
  { original_name: "green curry paste", canonical_name: "green curry paste" },
  { original_name: "jasmine rice, cooked", canonical_name: "rice" },
  { original_name: "cooked rice", canonical_name: "rice" },
  { original_name: "lemon juice", canonical_name: "lemon juice" },
  { original_name: "maple syrup", canonical_name: "maple syrup" },
  { original_name: "olive oil", canonical_name: "olive oil" },
  { original_name: "onion, sliced", canonical_name: "onion" },
  { original_name: "oyster sauce", canonical_name: "oyster sauce" },
  { original_name: "pancetta, diced", canonical_name: "pancetta" },
  { original_name: "Pecorino Romano cheese, grated", canonical_name: "pecorino romano cheese" },
  { original_name: "quinoa, uncooked", canonical_name: "quinoa" },
  { original_name: "red pepper flakes", canonical_name: "red pepper flakes" },
  { original_name: "ripe avocado", canonical_name: "avocado" },
  { original_name: "salt", canonical_name: "salt" },
  { original_name: "salt and pepper", canonical_name: "salt and pepper" },
  { original_name: "soy sauce", canonical_name: "soy sauce" },
  { original_name: "spaghetti pasta", canonical_name: "spaghetti pasta" },
  { original_name: "sweet potato, cubed", canonical_name: "sweet potato" },
  { original_name: "tahini", canonical_name: "tahini" },
  { original_name: "Thai basil leaves", canonical_name: "thai basil" },
  { original_name: "vanilla extract", canonical_name: "vanilla extract" },
  { original_name: "vegetable oil", canonical_name: "vegetable oil" },
  { original_name: "white vinegar", canonical_name: "white vinegar" },
  { original_name: "whole grain bread", canonical_name: "whole grain bread" },
]

/**
 * Insert standardized ingredients into the database
 */
export async function insertStandardizedIngredients() {
  try {
    const client = createServerClient()

    console.log(`Inserting ${standardizedIngredientsData.length} standardized ingredients...`)

    // Add categories based on ingredient type (simple heuristic)
    const dataWithCategories = standardizedIngredientsData.map((ing) => ({
      canonical_name: ing.canonical_name,
      category: categorizeIngredient(ing.canonical_name),
    }))

    const { data, error } = await client.from("standardized_ingredients").insert(dataWithCategories)

    if (error) {
      console.error("Error inserting standardized ingredients:", error)
      return { success: false, error }
    }

    console.log("Successfully inserted standardized ingredients")
    return { success: true, inserted: dataWithCategories.length }
  } catch (error) {
    console.error("Error in insertStandardizedIngredients:", error)
    return { success: false, error }
  }
}

/**
 * Create ingredient mappings for recipes
 * Matches original ingredient names to standardized names
 */
export async function createIngredientMappingsForRecipes() {
  try {
    const client = createServerClient()

    // Get all recipes with their ingredients
    const { data: recipes, error: recipeError } = await client
      .from("recipes")
      .select("id, title, ingredients")

    if (recipeError || !recipes) {
      console.error("Error fetching recipes:", recipeError)
      return { success: false, error: recipeError }
    }

    // Create a map of original names to canonical names for quick lookup
    const mappingMap = new Map<string, string>()
    ingredientNameMappingsData.forEach((mapping) => {
      mappingMap.set(mapping.original_name.toLowerCase(), mapping.canonical_name.toLowerCase())
    })

    // Get standardized ingredients for ID lookup
    const { data: standardized, error: stdError } = await client
      .from("standardized_ingredients")
      .select("id, canonical_name")

    if (stdError || !standardized) {
      console.error("Error fetching standardized ingredients:", stdError)
      return { success: false, error: stdError }
    }

    const canonicalToIdMap = new Map<string, string>()
    standardized.forEach((ing) => {
      canonicalToIdMap.set(ing.canonical_name.toLowerCase(), ing.id)
    })

    // Process recipes and create mappings
    const mappingsToInsert: any[] = []
    let unmappedCount = 0

    for (const recipe of recipes) {
      if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) {
        continue
      }

      for (const ingredient of recipe.ingredients) {
        const originalName = ingredient.name || ""
        const originalNameLower = originalName.toLowerCase()

        // Try to find mapping
        let canonicalName: string | undefined

        // First, try exact mapping from our mapping data
        if (mappingMap.has(originalNameLower)) {
          canonicalName = mappingMap.get(originalNameLower)
        }

        // Second, try direct match (original name might be already canonical)
        if (!canonicalName && canonicalToIdMap.has(originalNameLower)) {
          canonicalName = originalNameLower
        }

        if (canonicalName && canonicalToIdMap.has(canonicalName)) {
          const standardizedId = canonicalToIdMap.get(canonicalName)
          mappingsToInsert.push({
            recipe_id: recipe.id,
            original_name: originalName,
            standardized_ingredient_id: standardizedId,
          })
        } else {
          console.warn(
            `Could not map "${originalName}" in recipe "${recipe.title}" (${recipe.id})`
          )
          unmappedCount++
        }
      }
    }

    // Batch insert mappings
    if (mappingsToInsert.length > 0) {
      console.log(`Inserting ${mappingsToInsert.length} ingredient mappings...`)
      const { error: insertError } = await client.from("ingredient_mappings").insert(mappingsToInsert)

      if (insertError) {
        console.error("Error inserting ingredient mappings:", insertError)
        return { success: false, error: insertError }
      }
    }

    console.log(`Successfully created ingredient mappings`)
    console.log(`  Mapped: ${mappingsToInsert.length}`)
    console.log(`  Unmapped: ${unmappedCount}`)

    return {
      success: true,
      mapped: mappingsToInsert.length,
      unmapped: unmappedCount,
    }
  } catch (error) {
    console.error("Error in createIngredientMappingsForRecipes:", error)
    return { success: false, error }
  }
}

/**
 * Simple categorization heuristic
 * Maps ingredient names to categories for better organization
 */
function categorizeIngredient(name: string): string {
  const nameLower = name.toLowerCase()

  // Meat
  if (["beef", "chicken", "pancetta", "fish"].some((w) => nameLower.includes(w))) {
    return "Meat"
  }

  // Dairy
  if (["butter", "cheese", "milk", "eggs"].some((w) => nameLower.includes(w))) {
    return "Dairy"
  }

  // Produce
  if (
    [
      "spinach",
      "pepper",
      "broccoli",
      "bean",
      "eggplant",
      "avocado",
      "basil",
      "garlic",
      "onion",
      "potato",
      "bread",
    ].some((w) => nameLower.includes(w))
  ) {
    return "Produce"
  }

  // Spices
  if (["pepper", "salt", "flake", "herb"].some((w) => nameLower.includes(w))) {
    return "Spices"
  }

  // Pantry (default)
  return "Pantry"
}

/**
 * Run all setup operations
 */
export async function setupIngredientData() {
  console.log("=".repeat(50))
  console.log("Setting up ingredient data...")
  console.log("=".repeat(50))

  const result1 = await insertStandardizedIngredients()
  console.log()

  if (result1.success) {
    const result2 = await createIngredientMappingsForRecipes()
    console.log()

    return {
      success: true,
      standardizedInserted: result1.inserted,
      mappingsCreated: result2.mapped,
      mappingsUnmapped: result2.unmapped,
    }
  }

  return { success: false, error: result1.error }
}

// If run directly as a script
if (require.main === module) {
  setupIngredientData()
    .then((result) => {
      console.log("\nFinal Result:", result)
      process.exit(result.success ? 0 : 1)
    })
    .catch((error) => {
      console.error("Fatal error:", error)
      process.exit(1)
    })
}
