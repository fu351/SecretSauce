import { NextRequest, NextResponse } from "next/server"
import type { RecipeImportResponse } from "@/lib/types"
import { runPythonRecipeImportPipeline } from "@/backend/orchestrators/python-api-pipeline/pipeline"

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" } as RecipeImportResponse,
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid URL format" } as RecipeImportResponse,
        { status: 400 }
      )
    }

    const result = await runPythonRecipeImportPipeline("url", { url })
    return NextResponse.json(result.body, { status: result.status })

  } catch (error) {
    console.error("Recipe URL import error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to import recipe from URL"
      } as RecipeImportResponse,
      { status: 500 }
    )
  }
}
