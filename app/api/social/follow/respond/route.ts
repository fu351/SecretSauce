import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"

export const runtime = "nodejs"

export async function PATCH(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { requestId, action } = await req.json()
    if (!requestId || !action) {
      return NextResponse.json({ error: "requestId and action are required" }, { status: 400 })
    }
    if (action !== "accept" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'accept' or 'reject'" }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const db = followDB.withServiceClient(supabase)
    const request = action === "accept"
      ? await db.acceptRequest(requestId, profile.id)
      : await db.rejectRequest(requestId, profile.id)

    if (!request) {
      return NextResponse.json(
        { error: "Request not found or not authorized" },
        { status: 404 }
      )
    }

    return NextResponse.json({ request })
  } catch (error) {
    console.error("[social/follow/respond PATCH] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
