import { type NextRequest, NextResponse } from "next/server"
import { runFrontendScraperApiProcessor } from "@/backend/workers/frontend-scraper-worker/processor"

export async function GET(request: NextRequest) {
  const result = await runFrontendScraperApiProcessor(request.url)
  return NextResponse.json(result.body, { status: result.status })
}
