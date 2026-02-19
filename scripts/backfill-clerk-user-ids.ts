#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

type ProfileRow = {
  id: string
  email: string | null
  clerk_user_id: string | null
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, "../.env.local") })
dotenv.config({ path: path.join(__dirname, "../.env") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY
const CLERK_API_URL = process.env.CLERK_API_URL ?? "https://api.clerk.com/v1"

const DEFAULT_LIMIT = 500
const envLimit = Number(process.env.CLERK_BACKFILL_LIMIT ?? DEFAULT_LIMIT)
const LIMIT = Number.isFinite(envLimit) && envLimit > 0 ? Math.floor(envLimit) : DEFAULT_LIMIT
const DRY_RUN = process.argv.includes("--dry-run")

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

if (!CLERK_SECRET_KEY) {
  console.error("Missing CLERK_SECRET_KEY.")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function findClerkUserIdByEmail(email: string): Promise<string | null> {
  const trimmed = String(email || "").trim().toLowerCase()
  if (!trimmed) return null

  const url = new URL(`${CLERK_API_URL}/users`)
  url.searchParams.set("email_address", trimmed)
  url.searchParams.set("limit", "10")

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Clerk API ${response.status}: ${body}`)
  }

  const users = (await response.json()) as Array<{
    id?: string
    email_addresses?: Array<{ email_address?: string }>
  }>

  if (!Array.isArray(users) || users.length === 0) {
    return null
  }

  const exact = users.find((user) =>
    (user.email_addresses ?? []).some(
      (entry) => String(entry?.email_address || "").toLowerCase() === trimmed
    )
  )

  if (exact?.id) return exact.id
  if (users.length === 1 && users[0]?.id) return users[0].id
  return null
}

async function main(): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, clerk_user_id")
    .is("clerk_user_id", null)
    .not("email", "is", null)
    .limit(LIMIT)

  if (error) {
    throw new Error(`Failed to load profiles: ${error.message}`)
  }

  const rows = (data ?? []) as ProfileRow[]
  if (!rows.length) {
    console.log("[backfill-clerk-user-ids] No profiles need backfill.")
    return
  }

  let matched = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    const email = row.email?.trim()
    if (!email) {
      skipped += 1
      continue
    }

    try {
      const clerkUserId = await findClerkUserIdByEmail(email)
      if (!clerkUserId) {
        skipped += 1
        continue
      }

      matched += 1

      if (DRY_RUN) {
        console.log(`[dry-run] ${row.id} ${email} -> ${clerkUserId}`)
        continue
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          clerk_user_id: clerkUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)

      if (updateError) {
        failed += 1
        console.error(
          `[backfill-clerk-user-ids] Failed update for ${row.id}: ${updateError.message}`
        )
        continue
      }

      updated += 1
    } catch (err) {
      failed += 1
      console.error(
        `[backfill-clerk-user-ids] Error for ${row.id} (${email}):`,
        err
      )
    }
  }

  console.log("[backfill-clerk-user-ids] Complete")
  console.log(
    JSON.stringify(
      {
        scanned: rows.length,
        matched,
        updated,
        skipped,
        failed,
        dryRun: DRY_RUN,
      },
      null,
      2
    )
  )
}

void main().catch((error) => {
  console.error("[backfill-clerk-user-ids] Fatal error:", error)
  process.exit(1)
})
