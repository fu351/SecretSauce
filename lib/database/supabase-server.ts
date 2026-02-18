import "server-only"

import { auth } from "@clerk/nextjs/server"
import { createMonitoredClient } from "@/lib/database/supabase"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const clerkSupabaseJwtTemplate = process.env.CLERK_SUPABASE_JWT_TEMPLATE
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const assertServerOnly = (name: string) => {
  if (typeof window !== "undefined") {
    throw new Error(`${name} is server-only; do not call from the browser.`)
  }
}

const getSupabaseUrl = () => {
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.")
  }
  return supabaseUrl
}

const getSupabaseAnonKey = () => {
  if (!supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.")
  }
  return supabaseAnonKey
}

const getSupabaseServiceKey = () => {
  if (!supabaseServiceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.")
  }
  return supabaseServiceKey
}

const getClerkSupabaseJwtTemplate = () => {
  if (!clerkSupabaseJwtTemplate) {
    throw new Error("Missing CLERK_SUPABASE_JWT_TEMPLATE environment variable.")
  }
  return clerkSupabaseJwtTemplate
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
  return createMonitoredClient(
    getSupabaseUrl(),
    getSupabaseServiceKey(),
    serverClientBaseOptions
  )
}

// User-scoped client (RLS-enforced) using Clerk-issued Supabase JWT.
export const createUserSupabaseClient = () => {
  assertServerOnly("createUserSupabaseClient")
  const url = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()
  const jwtTemplate = getClerkSupabaseJwtTemplate()

  return createMonitoredClient(url, anonKey, {
    ...serverClientBaseOptions,
    accessToken: async () => {
      const authState = await auth()
      const token = await authState.getToken({ template: jwtTemplate })
      return token ?? null
    },
  })
}

// Anonymous client (RLS-enforced as anon, no user token).
export const createAnonSupabaseClient = () => {
  assertServerOnly("createAnonSupabaseClient")
  return createMonitoredClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    serverClientBaseOptions
  )
}

// Backward-compatible aliases. Prefer the explicit function names above.
export const createServerClient = createServiceSupabaseClient
export const createServerSupabaseClient = createUserSupabaseClient
