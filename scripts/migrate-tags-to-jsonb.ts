/**
 * Migration script to convert tags from text[] to JSONB structure
 *
 * This script:
 * 1. Converts existing tags text[] array to JSONB structure
 * 2. Preserves existing dietary tags in the new structure
 * 3. Initializes empty fields for auto-generated tags
 *
 * Run with: npx ts-node scripts/migrate-tags-to-jsonb.ts
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface RecipeTags {
  dietary: string[]
  allergens?: {
    contains_dairy: boolean
    contains_gluten: boolean
    contains_nuts: boolean
    contains_shellfish: boolean
    contains_egg: boolean
    contains_soy: boolean
  }
  protein?: string
  meal_type?: string
  cuisine_guess?: string
}

async function migrateTagsToJsonb() {
  console.log("Starting tag migration from text[] to JSONB...")

  try {
    // Fetch all recipes with tags
    const { data: recipes, error: fetchError } = await supabase
      .from("recipes")
      .select("id, tags")

    if (fetchError) {
      console.error("Error fetching recipes:", fetchError)
      process.exit(1)
    }

    if (!recipes || recipes.length === 0) {
      console.log("No recipes found to migrate.")
      return
    }

    console.log(`Found ${recipes.length} recipes to migrate.`)

    const updates: Array<{ id: string; tags: RecipeTags }> = []

    for (const recipe of recipes) {
      // Check if already migrated (tags is JSONB with dietary property)
      if (
        recipe.tags &&
        typeof recipe.tags === "object" &&
        "dietary" in recipe.tags
      ) {
        console.log(`Recipe ${recipe.id} already migrated, skipping...`)
        continue
      }

      // Convert tags array to new JSONB structure
      const newTags: RecipeTags = {
        dietary: Array.isArray(recipe.tags) ? recipe.tags : [],
        allergens: undefined,
        protein: undefined,
        meal_type: undefined,
        cuisine_guess: undefined,
      }

      updates.push({
        id: recipe.id,
        tags: newTags,
      })
    }

    if (updates.length === 0) {
      console.log("All recipes are already migrated.")
      return
    }

    console.log(`Migrating ${updates.length} recipes...`)

    // Update recipes in batches to avoid overwhelming the database
    const batchSize = 10
    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize)

      for (const update of batch) {
        const { error: updateError } = await supabase
          .from("recipes")
          .update({ tags: update.tags })
          .eq("id", update.id)

        if (updateError) {
          console.error(
            `Failed to update recipe ${update.id}:`,
            updateError.message
          )
          errorCount++
        } else {
          successCount++
          if (successCount % 5 === 0) {
            console.log(`Migrated ${successCount}/${updates.length} recipes...`)
          }
        }
      }
    }

    console.log(
      `\nMigration complete!`
    )
    console.log(`✅ Successfully migrated: ${successCount}/${updates.length}`)
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount}/${updates.length}`)
    }
  } catch (error) {
    console.error("Migration failed:", error)
    process.exit(1)
  }
}

// Run migration
migrateTagsToJsonb()
  .then(() => {
    console.log("\n✅ Migration script completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Migration script failed:", error)
    process.exit(1)
  })
