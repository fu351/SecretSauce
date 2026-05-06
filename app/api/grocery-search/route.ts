import { type NextRequest, NextResponse } from "next/server"
import { runFrontendScraperApiProcessor } from "@/backend/orchestrators/frontend-scraper-pipeline/pipeline"
import { guardApiAvailability } from "@/lib/dev/api-availability"

export async function GET(request: NextRequest) {
  const unavailable = guardApiAvailability("grocery-search")
  if (unavailable) return unavailable

  const result = await runFrontendScraperApiProcessor(request.url)
  return NextResponse.json(result.body, { status: result.status })
}
