import "server-only"

import { auth } from "@clerk/nextjs/server"
import { createMonitoredClient } from "@/lib/database/supabase"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const clerkSupabaseJwtTemplate = process.env.CLERK_SUPABASE_JWT_TEMPLATE || "supabase"
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY

const assertServerOnly = (name: string) => {
  if (typeof window !== "undefined") {
    throw new Error(`${name} is server-only; do not call from the browser.`)
  }
}

const assertSupabaseUrl = () => {
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.")
  }
}

const assertSupabaseAnonKey = () => {
  if (!supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.")
  }
}

const assertSupabaseServiceKey = () => {
  if (!supabaseServiceKey) {
    throw new Error("Missing Supabase service credentials. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY.")
  }
}

const serverClientBaseOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: fetch.bind(globalThis),
  },
}

// Service-role client (bypasses RLS). Use only for trusted server paths.
export const createServiceSupabaseClient = () => {
  assertServerOnly("createServiceSupabaseClient")
  assertSupabaseUrl()
  assertSupabaseServiceKey()

  return createMonitoredClient(supabaseUrl, supabaseServiceKey, serverClientBaseOptions)
}

// User-scoped client (RLS-enforced) using Clerk-issued Supabase JWT.
export const createUserSupabaseClient = () => {
  assertServerOnly("createUserSupabaseClient")
  assertSupabaseUrl()
  assertSupabaseAnonKey()

  return createMonitoredClient(supabaseUrl, supabaseAnonKey, {
    ...serverClientBaseOptions,
    accessToken: async () => {
      const authState = await auth()
      const token = await authState.getToken({ template: clerkSupabaseJwtTemplate })
      return token ?? null
    },
  })
}

// Anonymous client (RLS-enforced as anon, no user token).
export const createAnonSupabaseClient = () => {
  assertServerOnly("createAnonSupabaseClient")
  assertSupabaseUrl()
  assertSupabaseAnonKey()

  return createMonitoredClient(supabaseUrl, supabaseAnonKey, serverClientBaseOptions)
}

// Backward-compatible aliases. Prefer the explicit function names above.
export const createServerClient = createServiceSupabaseClient
export const createServerSupabaseClient = createUserSupabaseClient
