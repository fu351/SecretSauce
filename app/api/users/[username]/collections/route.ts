import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { resolveProfileAccess } from "@/lib/social/profile-access"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username: rawUsername } = await params
    const access = await resolveProfileAccess(rawUsername)

    if (!access) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!access.canViewContent) {
      return NextResponse.json({ error: "Profile is private" }, { status: 403 })
    }

    const supabase = createServiceSupabaseClient()
    const { data: collections, error } = await supabase
      .from("recipe_collections")
      .select("id, name, is_default")
      .eq("user_id", access.profile.id)
      .order("is_default", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[users/collections GET] DB error:", error)
      return NextResponse.json({ error: "Failed to fetch collections" }, { status: 500 })
    }

    const collectionIds = (collections ?? []).map((collection) => collection.id)
    let counts = new Map<string, number>()

    if (collectionIds.length > 0) {
      const { data: items, error: itemError } = await supabase
        .from("recipe_collection_items")
        .select("collection_id")
        .in("collection_id", collectionIds)

      if (itemError) {
        console.error("[users/collections GET] Count error:", itemError)
        return NextResponse.json({ error: "Failed to fetch collections" }, { status: 500 })
      }

      counts = new Map<string, number>()
      for (const item of items ?? []) {
        counts.set(item.collection_id, (counts.get(item.collection_id) ?? 0) + 1)
      }
    }

    return NextResponse.json({
      collections: (collections ?? []).map((collection) => ({
        id: collection.id,
        name: collection.name,
        is_default: collection.is_default,
        recipe_count: counts.get(collection.id) ?? 0,
      })),
    })
  } catch (error) {
    console.error("[users/collections GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
