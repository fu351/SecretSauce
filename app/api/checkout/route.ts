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

    // Parse request body for dynamic pricing parameters
    let body: {
      totalAmount?: number
      itemCount?: number
      cartItems?: Array<{
        item_id: string
        product_id: string
        num_pkgs: number
        frontend_price: number
      }>
    } = {}
    try {
      const text = await request.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      // If no body or invalid JSON, continue with defaults
    }

    // Validate pricing data to prevent manipulation
    if (body.totalAmount !== undefined) {
      if (typeof body.totalAmount !== "number" || body.totalAmount < 0 || body.totalAmount > 100000) {
        return NextResponse.json(
          { error: "Invalid pricing data" },
          { status: 400 }
        )
      }
    }
    if (body.itemCount !== undefined) {
      if (typeof body.itemCount !== "number" || body.itemCount < 0 || body.itemCount > 1000) {
        return NextResponse.json(
          { error: "Invalid item count" },
          { status: 400 }
        )
      }
    }

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

    // Check subscription status to determine coupon eligibility
    const { data: subscriptionData } = await supabase
      .from("profiles")
      .select("subscription_tier, subscription_expires_at")
      .eq("id", profile.id)
      .single()

    const isActiveSubscriber =
      subscriptionData?.subscription_tier === "premium" &&
      (subscriptionData?.subscription_expires_at === null ||
        new Date(subscriptionData.subscription_expires_at) > new Date())

    // Build checkout session configuration
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin
    const baseUrl = appUrl.replace(/\/checkout$/, "")

    // Prepare cart items for delivery log (passed via metadata)
    // Note: Stripe metadata values are limited to 500 characters
    // For large carts, consider storing in database and passing cart_id instead
    const cartItemsJson = body.cartItems ? JSON.stringify(body.cartItems) : null

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/cancel`,
      metadata: {
        supabase_user_id: supabaseUserId ?? "",
        clerk_user_id: clerkUserId ?? "",
        // SECURITY NOTE: These values are for tracking/analytics only
        // The actual charge amount is determined by stripePriceId (fixed subscription price)
        // DO NOT use these metadata values for pricing calculations
        total_amount: body.totalAmount?.toString() ?? "0",
        item_count: body.itemCount?.toString() ?? "0",
        // Cart items for delivery log (added after successful payment)
        ...(cartItemsJson && cartItemsJson.length < 500 ? { cart_items: cartItemsJson } : {}),
      },
    }

    // Apply coupon code for non-active subscribers
    const discountCouponId = process.env.STRIPE_DISCOUNT_COUPON_ID
    if (!isActiveSubscriber && discountCouponId) {
      sessionConfig.discounts = [
        {
          coupon: discountCouponId,
        },
      ]
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

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
