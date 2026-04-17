import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

export async function GET() {
  await requireAdmin()
  const supabase = createServiceSupabaseClient()

  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .order("starts_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ challenges: data })
}

export async function POST(req: NextRequest) {
  await requireAdmin()
  const supabase = createServiceSupabaseClient()

  const body = await req.json()
  const { title, description, points, starts_at, ends_at } = body

  if (!title || !starts_at || !ends_at) {
    return NextResponse.json({ error: "title, starts_at, and ends_at are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("challenges")
    .insert({ title, description: description || null, points: points ?? 100, starts_at, ends_at })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ challenge: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  await requireAdmin()
  const supabase = createServiceSupabaseClient()

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  const { error } = await supabase.from("challenges").delete().eq("id", id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
