#!/usr/bin/env tsx

import "../../scripts/load-env"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { sendWeeklyNotificationDigests } from "../../../lib/notifications/notification-service"
import type { Database } from "../../../lib/database/supabase"

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name} environment variable`)
  }
  return value
}

function createServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  return createClient<Database>(
    requireEnv("SUPABASE_URL", url),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", serviceKey),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: fetch.bind(globalThis),
      },
    }
  )
}

export async function runNotificationDigestPipeline(): Promise<void> {
  const client = createServiceClient()
  console.log("[NotificationDigestPipeline] Starting weekly digest run")
  const summary = await sendWeeklyNotificationDigests(client, { windowDays: 7 })
  console.log(
    `[NotificationDigestPipeline] Completed: recipients=${summary.recipientsProcessed}, digestsSent=${summary.digestsSent}`
  )
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+notification-digest[\\/]+pipeline(?:\.ts)?$/i.test(process.argv[1])
) {
  runNotificationDigestPipeline().catch((error: unknown) => {
    console.error("[NotificationDigestPipeline] Unhandled error:", error)
    process.exit(1)
  })
}
