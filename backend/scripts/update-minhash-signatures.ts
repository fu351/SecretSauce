#!/usr/bin/env tsx

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { computeMinHash } from "../workers/ingredient-worker/minhash/compute"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const PAGE_SIZE = 500

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main(): Promise<void> {
  let offset = 0
  let total = 0

  while (true) {
    const { data, error } = await supabase
      .from("standardized_ingredients")
      .select("id, canonical_name")
      .order("canonical_name", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw error
    const rows = data || []
    if (!rows.length) break

    const payload = rows
      .filter((row) => row.id && row.canonical_name)
      .map((row) => ({
        canonical_id: row.id,
        signature: computeMinHash(row.canonical_name, { bands: 128, kgram: 3 }),
        updated_at: new Date().toISOString(),
      }))

    if (payload.length) {
      const { error: upsertError } = await supabase
        .from("ingredient_minhash_signatures")
        .upsert(payload, { onConflict: "canonical_id" })

      if (upsertError) throw upsertError
      total += payload.length
    }

    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  console.log(`[minhash] Updated ${total} ingredient signature(s)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
