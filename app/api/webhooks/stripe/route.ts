import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { storeListHistoryDB } from "@/lib/database/store-list-history-db"
import { getPostHogClient } from "@/lib/posthog-server"

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
  const supabase = createServiceSupabaseClient()
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

        // Track subscription activation server-side
        if (supabaseUserId) {
          const posthog = getPostHogClient(request.headers.get("cookie"))
          posthog.capture({
            distinctId: supabaseUserId,
            event: "subscription_activated",
            properties: {
              supabase_user_id: supabaseUserId,
              stripe_customer_id: customerId ?? undefined,
              subscription_id: subscriptionId,
            },
          })
        }

        // Add cart items to delivery log after successful payment.
        // Reads from pending_cart_items (stored during checkout) to avoid the
        // 500-char Stripe metadata limit that silently dropped large carts.
        const cartId = session.metadata?.cart_id
        const legacyCartItemsJson = session.metadata?.cart_items

        if (supabaseUserId && (cartId || legacyCartItemsJson)) {
          try {
            let cartItems: Array<{
              item_id: string
              product_id: string
              num_pkgs: number
              frontend_price: number
            }> | null = null

            if (cartId) {
              // Primary path: fetch from pending_cart_items, mark as consumed
              const supabaseService = createServiceSupabaseClient()
              const { data: pendingCart, error: fetchError } = await supabaseService
                .from("pending_cart_items" as any)
                .select("items, stripe_session_id")
                .eq("id", cartId)
                .maybeSingle()

              if (fetchError) {
                console.error("[stripe-webhook] Failed to fetch pending cart:", fetchError)
              } else if (!pendingCart) {
                console.warn(`[stripe-webhook] Pending cart ${cartId} not found — may have expired`)
              } else if ((pendingCart as any).stripe_session_id) {
                // Already processed (webhook replay) — skip to prevent double-logging
                console.log(`[stripe-webhook] Pending cart ${cartId} already consumed, skipping delivery log`)
                cartItems = null
              } else {
                cartItems = (pendingCart as any).items

                // Mark as consumed to make replay idempotent
                await supabaseService
                  .from("pending_cart_items" as any)
                  .update({ stripe_session_id: session.id } as any)
                  .eq("id", cartId)
              }
            } else if (legacyCartItemsJson) {
              // Fallback: legacy cart_items metadata (carts created before this change)
              cartItems = JSON.parse(legacyCartItemsJson)
            }

            if (cartItems && cartItems.length > 0) {
              const results = await storeListHistoryDB.bulkAddToDeliveryLog(cartItems)

              const priceMismatches = results.filter(r => r.success && !r.price_matched)
              if (priceMismatches.length > 0) {
                console.warn(
                  `[stripe-webhook] Price mismatches detected for user ${supabaseUserId}:`,
                  priceMismatches
                )
              }

              const failures = results.filter(r => !r.success)
              if (failures.length > 0) {
                console.error(
                  `[stripe-webhook] Failed to add items to delivery log for user ${supabaseUserId}:`,
                  failures
                )
              }

              console.log(
                `[stripe-webhook] Added ${results.filter(r => r.success).length}/${cartItems.length} items to delivery log for user ${supabaseUserId}`
              )
            }
          } catch (error) {
            console.error(
              "[stripe-webhook] Failed to process cart items for delivery log:",
              error
            )
          }
        }
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
