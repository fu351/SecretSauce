import { NextRequest, NextResponse } from "next/server"
import { POST as createCheckoutSession } from "@/app/api/checkout/route"

export const runtime = "nodejs"

// Backward-compatible alias for legacy integrations that still call /api/stripe/checkout.
export async function POST(request: NextRequest) {
  return createCheckoutSession(request)
}

// If someone opens the old endpoint directly in a browser, send them to the checkout page.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = "/checkout"
  return NextResponse.redirect(url)
}
