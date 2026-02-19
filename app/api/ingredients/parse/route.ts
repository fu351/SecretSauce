import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { parseIngredientParagraph } from "@/lib/ingredient-parser"
import { getUnitKeywordsCached } from "@/lib/database/unit-standardization-db"

export async function POST(request: NextRequest) {
  const authState = await auth()
  if (!authState.userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 })
  }

  try {
    const unitKeywords = await getUnitKeywordsCached()
    const rows = parseIngredientParagraph(body.text, unitKeywords)
    return NextResponse.json({ rows, unitKeywords })
  } catch (error) {
    console.error("[IngredientParseAPI] Failed to parse ingredients:", error)
    return NextResponse.json({ error: "Failed to parse ingredients" }, { status: 500 })
  }
}
