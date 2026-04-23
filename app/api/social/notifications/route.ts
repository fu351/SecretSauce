import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/notification-service"
import { isAbortLikeError } from "@/lib/server/abort-error"

export const runtime = "nodejs"

async function resolveViewerProfileId(clerkUserId: string) {
  const supabase = createServiceSupabaseClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  return { supabase, profileId: profile?.id ?? null }
}

export async function GET(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const countOnly = searchParams.get("countOnly") === "true"
    const unreadOnly = searchParams.get("unreadOnly") === "true"
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100)

    const { supabase, profileId } = await resolveViewerProfileId(clerkUserId)
    if (!profileId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    if (countOnly) {
      const unreadCount = await fetchUnreadNotificationCount(supabase, profileId)
      return NextResponse.json({ unreadCount })
    }

    const notifications = await fetchNotifications(supabase, profileId, { limit, unreadOnly })
    return NextResponse.json({
      notifications,
      unreadCount: await fetchUnreadNotificationCount(supabase, profileId),
    })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[social/notifications GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { supabase, profileId } = await resolveViewerProfileId(clerkUserId)
    if (!profileId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === "string" ? body.action : "mark_all_read"

    if (action === "mark_all_read") {
      const ok = await markAllNotificationsRead(supabase, profileId)
      if (!ok) {
        return NextResponse.json({ error: "Failed to mark notifications read" }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    if (action === "mark_read") {
      const notificationId = typeof body.notificationId === "string" ? body.notificationId : null
      if (!notificationId) {
        return NextResponse.json({ error: "notificationId is required" }, { status: 400 })
      }

      const ok = await markNotificationRead(supabase, profileId, notificationId)
      if (!ok) {
        return NextResponse.json({ error: "Failed to mark notification read" }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[social/notifications PATCH] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
