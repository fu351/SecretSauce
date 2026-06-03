/**
 * GET /api/receipt/training/queue
 *
 * Returns the current user's training-data verification queue: receipts
 * they uploaded that need a thumbs-up/edit before becoming gold-standard
 * training data.
 *
 * Query params:
 *   limit  default 25, max 100
 *   scope  "mine" (default) | "all" (admin-gated, currently same as "mine"
 *          until role plumbing exists)
 */

import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { profileIdFromClerkUserId } from "@/lib/auth/clerk-profile-id"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const authState = await auth()
  const clerkUserId = authState?.userId
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = profileIdFromClerkUserId(clerkUserId)
  const sb = createServiceSupabaseClient()

  const limit = Math.min(
    100,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? "25")),
  )

  // Show:
  //   - rows owned by the current user (always)
  //   - that still need review
  //   - that haven't been soft-deleted
  // Ordered oldest-first so users finish what they started before new uploads.
  const { data, error } = await sb
    .from("receipt_training_examples")
    .select(
      "id, image_storage_path, candidate_parse, parse_confidence, " +
        "strategy_used, strategies_tried, disposition, created_at",
    )
    .eq("user_id", userId)
    .eq("disposition", "needs_review")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also report counts by disposition so the UI can show "23 verified, 7 pending"
  // without a second round-trip.
  const { data: counts } = await sb
    .from("receipt_training_examples")
    .select("disposition")
    .eq("user_id", userId)
    .is("deleted_at", null)

  const byDisposition: Record<string, number> = { auto_accepted: 0, needs_review: 0, rejected: 0 }
  for (const r of counts ?? []) {
    const d = (r as { disposition?: string }).disposition
    if (d && d in byDisposition) byDisposition[d] += 1
  }

  return NextResponse.json({
    success: true,
    queue: data ?? [],
    counts: byDisposition,
  })
}
