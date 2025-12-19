import { type NextRequest, NextResponse } from "next/server"
import { getRecipePricingInfo } from "@/lib/recipe-pricing"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const recipeId = searchParams.get("recipeId")

    if (!recipeId) {
      return NextResponse.json({ error: "recipeId parameter is required" }, { status: 400 })
    }

    const pricingInfo = await getRecipePricingInfo(recipeId)

    if (!pricingInfo) {
      return NextResponse.json({ error: "Failed to fetch pricing information" }, { status: 500 })
    }

    return NextResponse.json(pricingInfo)
  } catch (error) {
    console.error("Error fetching recipe pricing:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch recipe pricing",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
