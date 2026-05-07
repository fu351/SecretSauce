import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { resolveProfileAccess } from "@/lib/social/profile-access"
import { assertSocialEnabled, getProfileKitchenActivity } from "@/lib/social/service"

export const runtime = "nodejs"

const PAGE_SIZE = 6

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username: rawUsername } = await params
    const { searchParams } = new URL(req.url)
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0))
    const limit = Math.min(PAGE_SIZE, Math.max(1, Number(searchParams.get("limit") ?? PAGE_SIZE)))
    const access = await resolveProfileAccess(rawUsername)

    if (!access) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!access.canViewContent) {
      return NextResponse.json({ error: "Profile is private" }, { status: 403 })
    }

    const supabase = createServiceSupabaseClient()
    const socialEnabled = await assertSocialEnabled(supabase as any, access.profile.id)
    if (!socialEnabled) {
      return NextResponse.json({ items: [], hasMore: false, hidden: true })
    }

    const result = await getProfileKitchenActivity(supabase as any, {
      ownerProfileId: access.profile.id,
      viewerProfileId: access.viewerProfileId,
      limit,
      offset,
    })

    if ("error" in result && result.error) {
      return NextResponse.json({ error: "Kitchen activity could not be loaded" }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[users/kitchen-activity GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
