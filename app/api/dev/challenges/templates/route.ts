import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

export async function GET() {
  await requireAdmin()
  const supabase = createServiceSupabaseClient()

  const { data, error } = await supabase
    .from("community_challenge_templates")
    .select("*")
    .order("title", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ templates: data })
}

export async function POST(req: NextRequest) {
  await requireAdmin()
  const supabase = createServiceSupabaseClient()

  const body = await req.json()
  const { title, description, points } = body

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("community_challenge_templates")
    .insert({ title, description: description || null, points: points ?? 100 })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ template: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  await requireAdmin()
  const supabase = createServiceSupabaseClient()

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  const { error } = await supabase
    .from("community_challenge_templates")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
