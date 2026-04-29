import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export type AuthenticatedProfileResult =
  | { ok: true; supabase: ReturnType<typeof createServiceSupabaseClient>; profileId: string; clerkUserId: string }
  | { ok: false; status: 401 | 404; error: string }

export async function getAuthenticatedProfile(): Promise<AuthenticatedProfileResult> {
  const authState = await auth()
  const clerkUserId = authState.userId ?? null
  if (!clerkUserId) {
    return { ok: false, status: 401, error: "Unauthorized" }
  }

  const supabase = createServiceSupabaseClient()
  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  if (error || !data?.id) {
    return { ok: false, status: 404, error: "Profile not found" }
  }

  return { ok: true, supabase, profileId: data.id, clerkUserId }
}
