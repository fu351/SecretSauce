import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin"
import {
  getApiAvailabilitySnapshot,
  isApiAvailabilityKey,
  resetApiAvailability,
  setApiAvailability,
} from "@/lib/dev/api-availability"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function devTogglesAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_API_TOGGLES === "true"
}

export async function GET() {
  await requireAdmin()
  return NextResponse.json({
    enabled: devTogglesAllowed(),
    apis: getApiAvailabilitySnapshot(),
  })
}

export async function PATCH(req: Request) {
  await requireAdmin()

  if (!devTogglesAllowed()) {
    return NextResponse.json({ error: "API availability toggles are disabled." }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const updates = Array.isArray(body?.updates) ? body.updates : [body]

  for (const update of updates) {
    if (!isApiAvailabilityKey(update?.key) || typeof update?.enabled !== "boolean") {
      return NextResponse.json(
        { error: "Each update must include a valid key and boolean enabled value." },
        { status: 400 }
      )
    }
  }

  for (const update of updates) {
    setApiAvailability(update.key, update.enabled)
  }

  return NextResponse.json({
    enabled: true,
    apis: getApiAvailabilitySnapshot(),
  })
}

export async function DELETE() {
  await requireAdmin()

  if (!devTogglesAllowed()) {
    return NextResponse.json({ error: "API availability toggles are disabled." }, { status: 403 })
  }

  return NextResponse.json({
    enabled: true,
    apis: resetApiAvailability(),
  })
}
