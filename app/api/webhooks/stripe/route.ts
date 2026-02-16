import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createServerClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

function resolveTierFromStatus(
  status: Stripe.Subscription.Status
): "free" | "premium" {
  if (status === "active" || status === "trialing" || status === "past_due") {
    return "premium"
  }
  return "free"
}

function toIsoOrNull(unixSeconds?: number | null): string | null {
  if (!unixSeconds) return null
  return new Date(unixSeconds * 1000).toISOString()
}

function getSubscriptionPeriod(subscription: Stripe.Subscription): {
  start: number | null
  end: number | null
} {
  const firstItem = subscription.items.data[0]
  return {
    start: firstItem?.current_period_start ?? null,
    end: firstItem?.current_period_end ?? null,
  }
}

async function updateProfileFromSubscription(
  subscription: Stripe.Subscription,
  lookup: {
    supabaseUserId?: string | null
    clerkUserId?: string | null
    customerId?: string | null
  }
) {
  const supabase = createServerClient()
  const period = getSubscriptionPeriod(subscription)

  const updatePayload = {
    subscription_tier: resolveTierFromStatus(subscription.status),
    subscription_started_at: toIsoOrNull(period.start),
    subscription_expires_at: toIsoOrNull(period.end),
    subscription_status: subscription.status,
    stripe_customer_id:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id ?? null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: subscription.items.data[0]?.price?.id ?? null,
    stripe_current_period_end: toIsoOrNull(period.end),
    updated_at: new Date().toISOString(),
  }

  if (lookup.supabaseUserId) {
    const { error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", lookup.supabaseUserId)

    if (error) {
      console.error(
        "[stripe-webhook] Failed profile update by Supabase user id:",
        error
      )
    }
    return
  }

  if (lookup.clerkUserId) {
    const { error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("clerk_user_id", lookup.clerkUserId)

    if (error) {
      console.error("[stripe-webhook] Failed profile update by Clerk user id:", error)
    }
    return
  }

  if (lookup.customerId) {
    const { error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("stripe_customer_id", lookup.customerId)

    if (error) {
      console.error("[stripe-webhook] Failed profile update by customer id:", error)
    }
  }
}

export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripeSecretKey || !stripeWebhookSecret) {
    return NextResponse.json(
      {
        error:
          "Missing Stripe webhook configuration. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
      },
      { status: 500 }
    )
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    )
  }

  const stripe = new Stripe(stripeSecretKey)
  const body = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid webhook signature"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null
        if (!subscriptionId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const supabaseUserId =
          session.metadata?.supabase_user_id ?? session.metadata?.userId ?? null
        const clerkUserId = session.metadata?.clerk_user_id ?? null
        const customerId =
          typeof session.customer === "string" ? session.customer : null

        await updateProfileFromSubscription(subscription, {
          supabaseUserId,
          clerkUserId,
          customerId,
        })
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        await updateProfileFromSubscription(subscription, {
          customerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id ?? null,
        })
        break
      }
      default:
        break
    }
  } catch (error) {
    console.error("[stripe-webhook] Unhandled processing error:", error)
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }

  return NextResponse.json({ received: true })
}
