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
import { RecipeTags } from "@/lib/types/recipe"

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
    .select("id, title, ingredients, tags")
    .limit(10000)

  if (error) {
    console.error("Failed to load recipes", error)
    process.exit(1)
  }

  const updates: Array<{ id: string; tags: RecipeTags }> = []

  for (const row of data || []) {
    // Parse existing tags or create empty structure
    const existingTags: RecipeTags = row.tags || { dietary: [] }

    // Skip if all auto-generated tags are already populated
    if (
      existingTags.allergens &&
      existingTags.protein &&
      existingTags.meal_type
    ) {
      continue
    }

    // Generate auto-tags from ingredients
    const autoTags = tagRecipeFromIngredients(
      Array.isArray(row.ingredients) ? row.ingredients : [],
      row.title || ""
    )

    // Merge with existing dietary tags (user-editable, don't overwrite)
    const updatedTags: RecipeTags = {
      dietary: existingTags.dietary || [],
      allergens: autoTags.dietary_flags,
      protein: autoTags.protein_tag,
      meal_type: autoTags.meal_type_guess || undefined,
      cuisine_guess: autoTags.cuisine_guess || undefined,
    }

    updates.push({
      id: row.id,
      tags: updatedTags,
    })
  }

  console.log(`Updating ${updates.length} recipes with auto-generated tags...`)

  // Update recipes one by one for safety
  let successCount = 0
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("recipes")
      .update({ tags: update.tags })
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

main()
