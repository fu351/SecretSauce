import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { hasAccessToTier } from "@/lib/auth/subscription"
import type { RecipeImportResponse } from "@/lib/types"
import { runPythonRecipeImportPipeline } from "@/backend/orchestrators/python-api-pipeline/pipeline"
import { guardApiAvailability } from "@/lib/dev/api-availability"

const MAX_OCR_TEXT_LENGTH = 10000

export async function POST(request: NextRequest) {
  try {
    const unavailable = guardApiAvailability("recipe-import-image")
    if (unavailable) return unavailable

    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" } as RecipeImportResponse,
        { status: 401 }
      )
    }

    const hasPremium = await hasAccessToTier("premium")
    if (!hasPremium) {
      return NextResponse.json(
        { success: false, error: "Premium subscription required" } as RecipeImportResponse,
        { status: 403 }
      )
    }

    const { text } = await request.json()

    if (typeof text !== "string" || text.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: "OCR text is too short or empty" } as RecipeImportResponse,
        { status: 400 }
      )
    }

    if (text.length > MAX_OCR_TEXT_LENGTH) {
      return NextResponse.json(
        { success: false, error: `OCR text too long (max ${MAX_OCR_TEXT_LENGTH} characters)` } as RecipeImportResponse,
        { status: 400 }
      )
    }

    const result = await runPythonRecipeImportPipeline("text", {
      text,
      source_type: "image",
    })
    return NextResponse.json(result.body, { status: result.status })

  } catch (error) {
    console.error("Image import error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to parse recipe from image"
      } as RecipeImportResponse,
      { status: 500 }
    )
  }
}
