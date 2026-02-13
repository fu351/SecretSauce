import "server-only"

import { createMonitoredClient } from "@/lib/database/supabase"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

// Server-side client for service-role operations.
export const createServerClient = () => {
  if (typeof window !== "undefined") {
    throw new Error("createServerClient is server-only; do not call from the browser.")
  }

  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY

  if (!supabaseServiceKey) {
    throw new Error("Missing Supabase service credentials. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY.")
  }

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.")
  }

  return createMonitoredClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetch.bind(globalThis),
    },
  })
}
