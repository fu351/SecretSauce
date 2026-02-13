#!/usr/bin/env tsx

import { createServerClient } from "../lib/database/supabase-server"
import { buildMockRecipePayload, MOCK_RECIPES, RPC_NAME } from "../lib/dev/mock-recipes"

const SUPABASE_SEED_AUTHOR_ID = process.env.SUPABASE_SEED_AUTHOR_ID
const DRY_RUN = process.argv.includes("--dry-run")

if (!SUPABASE_SEED_AUTHOR_ID) {
  console.error("Missing SUPABASE_SEED_AUTHOR_ID. Set it to a valid profiles.id before running this script.")
  process.exit(1)
}

async function main(): Promise<void> {
  const seedAuthorId = SUPABASE_SEED_AUTHOR_ID
  if (!seedAuthorId) {
    throw new Error("Missing SUPABASE_SEED_AUTHOR_ID.")
  }

  const supabase = createServerClient()
  let succeeded = 0

  for (const recipe of MOCK_RECIPES) {
    const payload = buildMockRecipePayload(recipe, seedAuthorId)

    if (DRY_RUN) {
      console.log(`[seed-mock-recipes] Dry run would upsert:\n${JSON.stringify(payload, null, 2)}`)
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
