#!/usr/bin/env tsx

import "../../scripts/load-env"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { sendWeeklyMealPlannerReminders } from "../../../lib/notifications/meal-planner-reminder"
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

export async function runMealPlannerReminderPipeline(): Promise<void> {
  const client = createServiceClient()
  console.log("[MealPlannerReminderPipeline] Starting weekly meal planning reminder run")
  const summary = await sendWeeklyMealPlannerReminders(client)
  console.log(
    `[MealPlannerReminderPipeline] Completed: recipients=${summary.recipientsProcessed}, remindersSent=${summary.remindersSent}`
  )
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+meal-planner-reminder[\\/]+pipeline(?:\.ts)?$/i.test(process.argv[1])
) {
  runMealPlannerReminderPipeline().catch((error: unknown) => {
    console.error("[MealPlannerReminderPipeline] Unhandled error:", error)
    process.exit(1)
  })
}
