import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { getRecipePeerScoresBatch } from "@/lib/social/recipe-feedback-service"

export const runtime = "nodejs"

const MAX_BATCH_SIZE = 50

async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const raw = await req.text()
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })

  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const recipeIds = Array.isArray(body.recipeIds) ? body.recipeIds : null
  if (!recipeIds) return NextResponse.json({ error: "recipeIds must be an array" }, { status: 400 })
  if (recipeIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: `Batch size exceeds ${MAX_BATCH_SIZE}` }, { status: 400 })
  }

  const result = await getRecipePeerScoresBatch(
    profile.supabase as any,
    recipeIds.filter((id: unknown): id is string => typeof id === "string"),
  )
  if ("error" in result && result.error) {
    return NextResponse.json({ error: "Failed to load peer scores" }, { status: 500 })
  }
  return NextResponse.json(result)
}
