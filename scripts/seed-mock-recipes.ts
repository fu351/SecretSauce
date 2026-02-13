#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js"
import { buildMockRecipePayload, MOCK_RECIPES, RPC_NAME } from "../lib/dev/mock-recipes"

const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY
const SUPABASE_SEED_AUTHOR_ID = process.env.SUPABASE_SEED_AUTHOR_ID
const DRY_RUN = process.argv.includes("--dry-run")

if (!NEXT_PUBLIC_SUPABASE_URL) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL.")
  process.exit(1)
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY.")
  process.exit(1)
}

if (!SUPABASE_SEED_AUTHOR_ID) {
  console.error("Missing SUPABASE_SEED_AUTHOR_ID. Set it to a valid profiles.id before running this script.")
  process.exit(1)
}

async function main(): Promise<void> {
  const seedAuthorId = SUPABASE_SEED_AUTHOR_ID
  if (!seedAuthorId) {
    throw new Error("Missing SUPABASE_SEED_AUTHOR_ID.")
  }

  const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetch.bind(globalThis),
    },
  })
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
