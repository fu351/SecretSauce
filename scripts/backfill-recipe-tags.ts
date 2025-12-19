/**
 * Backfill recipe dietary_flags, protein_tag, cuisine_guess, and meal_type_guess based on ingredients and title.
 * Run with:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... tsx scripts/backfill-recipe-tags.ts
 *
 * This uses the service key; do NOT run in the browser.
 */
import { createClient } from "@supabase/supabase-js"
import { tagRecipeFromIngredients } from "@/lib/recipe-tagging"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

async function main() {
  const { data, error } = await supabase.from("recipes").select("id, title, ingredients, dietary_flags, protein_tag, meal_type_guess").limit(10000)
  if (error) {
    console.error("Failed to load recipes", error)
    process.exit(1)
  }

  const updates = []
  for (const row of data || []) {
    // Skip if all AI tags are already populated
    if (row.dietary_flags && row.protein_tag && row.meal_type_guess) continue
    const tags = tagRecipeFromIngredients(
      Array.isArray(row.ingredients) ? row.ingredients : [],
      row.title || ""
    )
    updates.push({
      id: row.id,
      dietary_flags: tags.dietary_flags,
      protein_tag: tags.protein_tag,
      cuisine_guess: tags.cuisine_guess,
      meal_type_guess: tags.meal_type_guess,
    })
  }

  console.log(`Updating ${updates.length} recipes...`)

  // Update recipes one by one (safer than bulk upsert which requires all NOT NULL fields)
  let successCount = 0
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("recipes")
      .update({
        dietary_flags: update.dietary_flags,
        protein_tag: update.protein_tag,
        cuisine_guess: update.cuisine_guess,
        meal_type_guess: update.meal_type_guess,
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
