import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { resolveAuthenticatedProfileId } from "@/lib/auth/admin"
import { PostFlagsDB } from "@/lib/database/post-flags-db"

export const runtime = "nodejs"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params
    const supabase = createServiceSupabaseClient()
    const reporterProfileId = await resolveAuthenticatedProfileId()

    if (!reporterProfileId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle()

    if (postError) {
      return NextResponse.json({ error: postError.message }, { status: 500 })
    }

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
    const details = typeof body?.details === "string" ? body.details.trim() : ""
    const severity = body?.severity === "low" || body?.severity === "high" ? body.severity : "medium"

    if (!reason) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 })
    }

    const flagsDB = new PostFlagsDB(supabase)
    const { data: existingOpenFlag } = await supabase
      .from("post_flags")
      .select("id, status, reason, details, created_at")
      .eq("post_id", postId)
      .eq("reporter_profile_id", reporterProfileId)
      .in("status", ["open", "reviewing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingOpenFlag) {
      return NextResponse.json({ flag: existingOpenFlag, deduped: true })
    }

    const flag = await flagsDB.createFlag({
      postId,
      reporterProfileId,
      reason,
      details: details || null,
      severity,
    })

    if (!flag) {
      return NextResponse.json({ error: "Failed to create flag" }, { status: 500 })
    }

    return NextResponse.json({ flag }, { status: 201 })
  } catch (error) {
    console.error("[posts/[postId]/flags POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

