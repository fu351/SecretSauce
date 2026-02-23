import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { hasAccessToTier } from "@/lib/auth/subscription"
import { parseRecipeParagraphWithAI } from "@/lib/recipe-paragraph-parser"
import { extractTimes } from "@/lib/recipe-time-extractor"

export async function POST(request: NextRequest) {
  const authState = await auth()
  if (!authState.userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const hasPremium = await hasAccessToTier("premium")
  if (!hasPremium) {
    return NextResponse.json({ error: "Premium subscription required" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 })
  }

  if (body.text.length > 10000) {
    return NextResponse.json({ error: "text too long (max 10000 characters)" }, { status: 400 })
  }

  try {
    // Run time extraction (regex, fast) and LLM parsing in parallel
    const [result, times] = await Promise.all([
      parseRecipeParagraphWithAI(body.text),
      Promise.resolve(extractTimes(body.text)),
    ])

    const warning =
      result.instructions.length === 0 && result.ingredients.length === 0
        ? "Could not extract structured data from the provided text"
        : undefined

    return NextResponse.json({
      instructions: result.instructions,
      ingredients: result.ingredients,
      ...times,
      ...(warning ? { warning } : {}),
    })
  } catch (error) {
    console.error("[ParagraphImportAPI] Failed to parse recipe paragraph:", error)
    return NextResponse.json({ error: "Failed to parse recipe" }, { status: 500 })
  }
}
