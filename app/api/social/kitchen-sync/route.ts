import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { getKitchenSyncFeed } from "@/lib/social/service"

export const runtime = "nodejs"

export async function GET() {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const result = await getKitchenSyncFeed(profile.supabase as any, profile.profileId)
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to load Kitchen Sync" }, { status: 500 })
  return NextResponse.json({ feed: result.feed })
}
