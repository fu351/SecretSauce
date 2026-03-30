import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { lat, lng } = body as { lat?: number; lng?: number }
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 })
  }

  const supabase = createServiceSupabaseClient()
  const { error } = await (supabase.from("profiles") as any)
    .update({
      latitude: lat,
      longitude: lng,
      updated_at: new Date().toISOString(),
    })
    .eq("clerk_user_id", userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
