import { NextResponse } from "next/server"
import { generateWeeklyDinnerPlan } from "@/lib/planner/agent"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const userId = body?.userId as string | undefined
    const weekIndex = body?.weekIndex as number | undefined

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    const plan = await generateWeeklyDinnerPlan(userId, weekIndex)
    return NextResponse.json(plan)
  } catch (error) {
    console.error("[weekly-dinner-plan] Failed to generate plan", error)
    return NextResponse.json(
      { error: "Failed to generate weekly meal plan. Please try again later." },
      { status: 500 }
    )
  }
}
