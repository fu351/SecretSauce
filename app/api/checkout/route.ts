import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

function extractSupabaseAccessToken(request: NextRequest): string | null {
  const headerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    ?.trim()

  if (headerToken) return headerToken

  return (
    request.cookies.get("sb-access-token")?.value ??
    request.cookies.get("supabase-access-token")?.value ??
    request.cookies.get("supabase-auth-token")?.value ??
    null
  )
}

type CheckoutProfile = {
  id: string
  email: string
  full_name: string | null
  stripe_customer_id: string | null
  clerk_user_id: string | null
}

function getPrimaryEmailAddress(clerkUser: any): string | null {
  const primaryId = clerkUser?.primaryEmailAddressId
  const email = clerkUser?.emailAddresses?.find(
    (item: any) => item?.id === primaryId
  )?.emailAddress
  return typeof email === "string" ? email : null
}

async function resolveCheckoutIdentity(
  request: NextRequest
): Promise<{
  profile: CheckoutProfile
  supabaseUserId: string | null
  clerkUserId: string | null
} | null> {
  const supabase = createServerClient()

  let clerkUserId: string | null = null
  try {
    const authState = await auth()
    clerkUserId = authState.userId ?? null
  } catch {
    clerkUserId = null
  }

  if (clerkUserId) {
    const { data: byClerk } = await supabase
      .from("profiles")
      .select("id, email, full_name, stripe_customer_id, clerk_user_id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle()

    if (byClerk) {
      return {
        profile: byClerk as CheckoutProfile,
        supabaseUserId: byClerk.id,
        clerkUserId,
      }
    }

    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkUserId)
    const email = getPrimaryEmailAddress(clerkUser)
    if (!email) return null

    const { data: byEmail } = await supabase
      .from("profiles")
      .select("id, email, full_name, stripe_customer_id, clerk_user_id")
      .eq("email", email)
      .maybeSingle()

    if (!byEmail) return null

    if (byEmail.clerk_user_id !== clerkUserId) {
      await supabase
        .from("profiles")
        .update({
          clerk_user_id: clerkUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", byEmail.id)
    }

    return {
      profile: {
        ...(byEmail as CheckoutProfile),
        clerk_user_id: clerkUserId,
      },
      supabaseUserId: byEmail.id,
      clerkUserId,
    }
  }

  const accessToken = extractSupabaseAccessToken(request)
  if (!accessToken) {
    return null
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken)

  if (authError || !user) {
    return null
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, stripe_customer_id, clerk_user_id")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return null
  }

  return {
    profile: profile as CheckoutProfile,
    supabaseUserId: user.id,
    clerkUserId: profile.clerk_user_id ?? null,
  }
}

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    const stripePriceId = process.env.STRIPE_PREMIUM_PRICE_ID
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

    if (!stripeSecretKey || !stripePriceId || !supabaseServiceKey) {
      return NextResponse.json(
        {
          error:
            "Missing configuration. Set STRIPE_SECRET_KEY, STRIPE_PREMIUM_PRICE_ID, and SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      )
    }
    if (supabaseServiceKey.startsWith("sb_publishable_")) {
      return NextResponse.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY is invalid. Use the Supabase service_role secret key, not a publishable key.",
        },
        { status: 500 }
      )
    }
    if (!stripePriceId.startsWith("price_")) {
      return NextResponse.json(
        {
          error:
            "STRIPE_PREMIUM_PRICE_ID must be a Stripe Price ID (price_...), not a Product ID (prod_...).",
        },
        { status: 500 }
      )
    }

    const identity = await resolveCheckoutIdentity(request)
    if (!identity) {
      return NextResponse.json(
        { error: "Unauthorized or missing linked profile" },
        { status: 401 }
      )
    }
    const { profile, supabaseUserId, clerkUserId } = identity
    const supabase = createServerClient()

    const stripe = new Stripe(stripeSecretKey)
    let stripeCustomerId = profile.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: profile.full_name ?? undefined,
        metadata: {
          supabase_user_id: supabaseUserId ?? "",
          clerk_user_id: clerkUserId ?? "",
        },
      })
      stripeCustomerId = customer.id

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", profile.id)
    }

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      metadata: {
        supabase_user_id: supabaseUserId ?? "",
        clerk_user_id: clerkUserId ?? "",
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error"
    console.error("[checkout] Failed to create checkout session:", error)
    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        details: process.env.NODE_ENV === "production" ? undefined : details,
      },
      { status: 500 }
    )
  }
}
