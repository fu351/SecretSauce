/**
 * Backfill auto-generated tags (allergens, protein, meal_type, cuisine_guess) in JSONB tags structure
 * based on ingredients and title.
 * Run with:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... tsx scripts/backfill-recipe-tags.ts
 *
 * This uses the service key; do NOT run in the browser.
 */
import { createClient } from "@supabase/supabase-js"
import { tagRecipeFromIngredients } from "@/lib/recipe-tagging"
import { RecipeTags } from "@/lib/types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

async function main() {
  const { data, error } = await supabase
    .from("recipes")
    .select("id, title, ingredients, tags, protein, meal_type")
    .limit(10000)

  if (error) {
    console.error("Failed to load recipes", error)
    process.exit(1)
  }

  const updates: Array<{ id: string; tags: RecipeTags; protein: string; meal_type: string | null }> = []

  for (const row of data || []) {
    // Skip if protein and meal_type are already populated
    if (row.protein && row.meal_type) {
      continue
    }

    // Generate auto-tags from ingredients
    const autoTags = tagRecipeFromIngredients(
      Array.isArray(row.ingredients) ? row.ingredients : [],
      row.title || ""
    )

    // Convert dietary_flags object to DietaryTag array
    const allergenTags: string[] = []
    if (autoTags.dietary_flags.contains_dairy) allergenTags.push('contains-dairy')
    if (autoTags.dietary_flags.contains_gluten) allergenTags.push('contains-gluten')
    if (autoTags.dietary_flags.contains_nuts) allergenTags.push('contains-nuts')
    if (autoTags.dietary_flags.contains_shellfish) allergenTags.push('contains-shellfish')
    if (autoTags.dietary_flags.contains_egg) allergenTags.push('contains-egg')
    if (autoTags.dietary_flags.contains_soy) allergenTags.push('contains-soy')

    // Merge with existing dietary tags (user-editable, don't overwrite existing user tags)
    const existingTags = (row.tags || []) as string[]
    const mergedTags = [...new Set([...existingTags, ...allergenTags])]

    updates.push({
      id: row.id,
      tags: mergedTags as RecipeTags,
      protein: autoTags.protein_tag,
      meal_type: autoTags.meal_type_guess || null,
    })
  }

  console.log(`Updating ${updates.length} recipes with auto-generated tags...`)

  // Update recipes one by one for safety
  let successCount = 0
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("recipes")
      .update({
        tags: update.tags,
        protein: update.protein,
        meal_type: update.meal_type,
      })
      .eq("id", update.id)

    if (updateError) {
      console.error(`Failed to update recipe ${update.id}:`, updateError)
      continue
    }

    successCount++
    if (successCount % 10 === 0) {
      console.log(`Updated ${successCount}/${updates.length}`)
    }
  }

  console.log(`Successfully updated ${successCount}/${updates.length} recipes`)

  console.log("Backfill complete")
}

main()
