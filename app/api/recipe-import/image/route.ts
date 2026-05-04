import { NextRequest, NextResponse } from "next/server"
import type { RecipeImportResponse } from "@/lib/types"
import { runPythonRecipeImportPipeline } from "@/backend/orchestrators/python-api-pipeline/pipeline"

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: "OCR text is too short or empty" } as RecipeImportResponse,
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
        error: error instanceof Error ? error.message : "Failed to parse recipe from image"
      } as RecipeImportResponse,
      { status: 500 }
    )
  }
}
