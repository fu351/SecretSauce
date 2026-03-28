import { type NextRequest, NextResponse } from "next/server"
import { runFrontendBatchScraperPipeline } from "@/backend/orchestrators/frontend-batch-scraper-pipeline"
import {
  DEFAULT_BATCH_SCRAPER_STORES,
  type BatchIngredient,
} from "@/backend/workers/frontend-scraper-worker/batch-utils"

interface BatchScraperRequestBody {
  ingredients: Array<BatchIngredient | string>
  zipCode?: string
  forceRefresh?: boolean
  stores?: string[]
}

function isBadInputError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes("required") || message.includes("array")
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const expectedSecret = process.env.CRON_SECRET

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized - Invalid CRON_SECRET" }, { status: 401 })
    }

    const body = (await request.json()) as BatchScraperRequestBody

    const output = await runFrontendBatchScraperPipeline({
      ingredients: body.ingredients,
      zipCode: body.zipCode || "",
      forceRefresh: body.forceRefresh === true,
      stores: body.stores,
    })

    return NextResponse.json({
      success: true,
      summary: output.summary,
      results: output.results,
      zipCode: output.zipCode,
    })
  } catch (error) {
    console.error("[Batch Scraper] Fatal error:", error)

    if (isBadInputError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Invalid request payload",
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "batch-scraper",
    status: "healthy",
    description: "Batch ingredient scraper for daily price updates",
    defaultStores: DEFAULT_BATCH_SCRAPER_STORES,
  })
}
