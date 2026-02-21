import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { parseRecipeParagraphWithAI } from "@/lib/recipe-paragraph-parser"

export async function POST(request: NextRequest) {
  const authState = await auth()
  if (!authState.userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 })
  }

  if (body.text.length > 10000) {
    return NextResponse.json({ error: "text too long (max 10000 characters)" }, { status: 400 })
  }

  try {
    const result = await parseRecipeParagraphWithAI(body.text)

    const warning =
      result.instructions.length === 0 && result.ingredients.length === 0
        ? "Could not extract structured data from the provided text"
        : undefined

    return NextResponse.json({
      instructions: result.instructions,
      ingredients: result.ingredients,
      ...(warning ? { warning } : {}),
    })
  } catch (error) {
    console.error("[ParagraphImportAPI] Failed to parse recipe paragraph:", error)
    return NextResponse.json({ error: "Failed to parse recipe" }, { status: 500 })
  }
}
