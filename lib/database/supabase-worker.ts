/**
 * Service-role Supabase client for queue workers.
 * Uses SUPABASE_SERVICE_ROLE_KEY so it bypasses RLS.
 * Never import this from browser or Next.js server components.
 */
import { createClient } from "@supabase/supabase-js"
import type { Database } from "./supabase"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing worker Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  )
}

export const supabaseWorker = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
