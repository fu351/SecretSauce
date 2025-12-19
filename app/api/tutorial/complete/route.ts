import { type NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function POST(request: NextRequest) {
  try {
    const { tutorial_path } = await request.json()

    if (!tutorial_path) {
      return NextResponse.json(
        { error: "tutorial_path is required" },
        { status: 400 }
      )
    }

    // Validate tutorial_path is one of the allowed values
    const validPaths = ["cooking", "budgeting", "health"]
    if (!validPaths.includes(tutorial_path)) {
      return NextResponse.json(
        { error: "Invalid tutorial_path. Must be one of: cooking, budgeting, health" },
        { status: 400 }
      )
    }

    // Get the current user from the Supabase session
    // The client-side auth is passed via cookies automatically
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error("Auth error:", userError)
      return NextResponse.json(
        { error: "Unauthorized - please log in and try again" },
        { status: 401 }
      )
    }

    // Update the profile with tutorial completion
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        tutorial_completed: true,
        tutorial_completed_at: new Date().toISOString(),
        tutorial_path: tutorial_path,
      })
      .eq("id", user.id)

    if (updateError) {
      console.error("Error updating tutorial completion:", updateError)
      return NextResponse.json(
        { error: "Failed to complete tutorial", details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Tutorial completed successfully",
    })
  } catch (error) {
    console.error("Error in tutorial completion:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
