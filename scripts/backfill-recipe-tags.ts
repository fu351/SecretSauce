/**
 * Backfill recipe dietary_flags and protein_tag based on ingredients.
 * Run with:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... ts-node scripts/backfill-recipe-tags.ts
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
  const { data, error } = await supabase.from("recipes").select("id, ingredients, dietary_flags, protein_tag").limit(10000)
  if (error) {
    console.error("Failed to load recipes", error)
    process.exit(1)
  }

  const updates = []
  for (const row of data || []) {
    if (row.dietary_flags && row.protein_tag) continue
    const tags = tagRecipeFromIngredients(Array.isArray(row.ingredients) ? row.ingredients : [])
    updates.push({
      id: row.id,
      dietary_flags: tags.dietary_flags,
      protein_tag: tags.protein_tag,
      cuisine_guess: tags.cuisine_guess,
    })
  }

  console.log(`Updating ${updates.length} recipes...`)
  const chunkSize = 500
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize)
    const { error: updateError } = await supabase.from("recipes").upsert(chunk)
    if (updateError) {
      console.error("Update error", updateError)
      process.exit(1)
    }
    console.log(`Updated ${i + chunk.length}/${updates.length}`)
  }

  console.log("Backfill complete")
}

main()
