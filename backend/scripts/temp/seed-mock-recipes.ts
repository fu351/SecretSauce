#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js"
import type { Database } from "../../../lib/database/supabase"
import {
  buildMockRecipePayload,
  MOCK_RECIPES,
  RPC_NAME,
  type UpsertRecipeRpcArgs,
} from "../../../lib/dev/mock-recipes"

const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const SUPABASE_SEED_AUTHOR_ID = process.env.SUPABASE_SEED_AUTHOR_ID ?? ""
const DRY_RUN = process.argv.includes("--dry-run")
const INCLUDE_QUEUE_DRIFT_ARG = process.argv.includes("--include-queue-drift-stress")

function readBooleanEnv(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return ["1", "true", "yes", "on"].includes(normalized)
}

function isQueueDriftStressRecipeTitle(title: string): boolean {
  return /^Queue Drift Stress Test \d+$/i.test(title.trim())
}

if (!NEXT_PUBLIC_SUPABASE_URL) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL.")
  process.exit(1)
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY.")
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

  const includeQueueDriftStressRecipes =
    INCLUDE_QUEUE_DRIFT_ARG || readBooleanEnv(process.env.INCLUDE_QUEUE_DRIFT_STRESS_RECIPES)
  const recipesToSeed = includeQueueDriftStressRecipes
    ? MOCK_RECIPES
    : MOCK_RECIPES.filter((recipe) => !isQueueDriftStressRecipeTitle(recipe.title))

  if (!includeQueueDriftStressRecipes) {
    const excluded = MOCK_RECIPES.length - recipesToSeed.length
    if (excluded > 0) {
      console.log(
        `[seed-mock-recipes] Skipping ${excluded} queue drift stress recipe(s). ` +
          `Use --include-queue-drift-stress or INCLUDE_QUEUE_DRIFT_STRESS_RECIPES=true to include them.`
      )
    }
  }

  const supabase = createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetch.bind(globalThis),
    },
  })
  let succeeded = 0

  for (const recipe of recipesToSeed) {
    const payload: UpsertRecipeRpcArgs = buildMockRecipePayload(recipe, seedAuthorId)

    if (DRY_RUN) {
      console.log(`[seed-mock-recipes] Dry run would upsert:\n${JSON.stringify(payload, null, 2)}`)
      continue
    }

    const { data, error } = await (supabase as unknown as {
      rpc: (name: string, args: UpsertRecipeRpcArgs) => Promise<{ data: unknown; error: { message: string } | null }>
    }).rpc(
      RPC_NAME,
      payload
    )
    if (error) {
      console.error(`[seed-mock-recipes] Failed to upsert ${recipe.title}:`, error.message)
      continue
    }

    const result = data && typeof data === "object" && !Array.isArray(data)
      ? (data as { title?: string | null; id?: string | null })
      : null

    succeeded += 1
    console.log(`[seed-mock-recipes] Upserted ${result?.title ?? recipe.title} (${result?.id ?? "unknown-id"})`)
  }

  console.log(
    `\n[seed-mock-recipes] Completed ${succeeded}/${recipesToSeed.length} recipes.${DRY_RUN ? " (dry run only)" : ""}`
  )
}

void main().catch((error) => {
  console.error("[seed-mock-recipes] Unexpected error:", error)
  process.exit(1)
})
