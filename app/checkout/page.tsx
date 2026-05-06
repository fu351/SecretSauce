"use client"

import { useTransition, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Check,
  Loader2,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCurrentTier } from "@/hooks/use-subscription"
import { capturePosthogEvent } from "@/lib/analytics/posthog-client"

const FREE_DELIVERY_FLAT_FEE = 7
const FREE_DELIVERY_TAX_RATE = 0.07
const PREMIUM_DELIVERY_FLAT_FEE = 5
const PREMIUM_DELIVERY_TAX_RATE = 0.05

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)
}

function calculateDeliveryTotals(basketTotal: number, flatFee: number, taxRate: number) {
  const taxableSubtotal = basketTotal + flatFee
  const tax = taxableSubtotal * taxRate

  return {
    basketTotal,
    flatFee,
    taxRate,
    taxableSubtotal,
    tax,
    grandTotal: taxableSubtotal + tax,
  }
}

export default function CheckoutPage() {
  const [isPending, startTransition] = useTransition()
  const searchParams = useSearchParams()
  const { tier, isActive, loading: tierLoading } = useCurrentTier()
  const [pricingInfo, setPricingInfo] = useState<{
    totalAmount?: number
    itemCount?: number
    cartItems?: Array<{
      item_id: string
      product_id: string
      num_pkgs: number
      frontend_price: number
    }>
  }>({})
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    // Extract pricing parameters from URL
    const total = searchParams.get("total")
    const items = searchParams.get("items")
    const cartItemsParam = searchParams.get("cartItems")

    let cartItems: Array<{
      item_id: string
      product_id: string
      num_pkgs: number
      frontend_price: number
    }> | undefined

    if (cartItemsParam) {
      try {
        cartItems = JSON.parse(decodeURIComponent(cartItemsParam))
      } catch (error) {
        console.error("Failed to parse cart items:", error)
      }
    }

    setPricingInfo({
      totalAmount: total ? parseFloat(total) : undefined,
      itemCount: items ? parseInt(items, 10) : undefined,
      cartItems,
    })
  }, [searchParams])

  const handleCheckout = () => {
    setCheckoutError(null)
    capturePosthogEvent("subscription_checkout_started", {
      item_count: pricingInfo.itemCount,
      total_amount: pricingInfo.totalAmount,
    })
    startTransition(async () => {
      try {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(pricingInfo),
        })

        const rawBody = await response.text()
        let payload: Record<string, unknown> = {}
        if (rawBody) {
          try {
            payload = JSON.parse(rawBody) as Record<string, unknown>
          } catch {
            payload = { raw: rawBody }
          }
        }

        if (!response.ok) {
          console.error("[checkout-page] Failed to create session:", {
            status: response.status,
            payload,
          })
          setCheckoutError("We couldn't start checkout. Please try again in a moment.")
          return
        }

        const url = typeof payload.url === "string" ? payload.url : null
        if (url) {
          window.location.href = url
        } else {
          console.error("[checkout-page] Missing checkout URL in response", payload)
          setCheckoutError("Stripe did not return a checkout link. Please try again.")
        }
      } catch (error) {
        console.error("[checkout-page] Checkout request failed:", error)
        setCheckoutError("We couldn't reach checkout. Please check your connection and try again.")
      }
    })
  }

  const hasCartSummary = pricingInfo.totalAmount !== undefined && pricingInfo.totalAmount > 0
  const isStoreCheckout = hasCartSummary
  const isPremium = !tierLoading && tier === "premium" && isActive
  const backHref = hasCartSummary ? "/store" : "/pricing"
  const backLabel = hasCartSummary ? "Back to Shopping" : "Back to Pricing"
  const basketTotal = pricingInfo.totalAmount ?? 0
  const activeFlatFee = isPremium ? PREMIUM_DELIVERY_FLAT_FEE : FREE_DELIVERY_FLAT_FEE
  const activeTaxRate = isPremium ? PREMIUM_DELIVERY_TAX_RATE : FREE_DELIVERY_TAX_RATE
  const activeDeliveryTotals = calculateDeliveryTotals(
    basketTotal,
    activeFlatFee,
    activeTaxRate
  )
  const premiumDeliveryTotals = calculateDeliveryTotals(
    basketTotal,
    PREMIUM_DELIVERY_FLAT_FEE,
    PREMIUM_DELIVERY_TAX_RATE
  )
  const premiumSavings = Math.max(0, activeDeliveryTotals.grandTotal - premiumDeliveryTotals.grandTotal)

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6 md:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <section className="p-5 md:p-8 lg:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
              {isStoreCheckout ? <ShoppingBag className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isStoreCheckout ? "Delivery Checkout" : "Premium"}
            </div>

            <h1 className="mt-5 font-serif text-3xl font-light tracking-tight text-foreground md:text-5xl">
              {isStoreCheckout ? "Review Your Basket" : "Finish Your Upgrade"}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              {isStoreCheckout
                ? "Confirm the basket estimate, delivery flat fee, and tax before continuing to checkout."
                : "Upgrade for a lower flat delivery fee plus tax, automatic weekly meal planning, and a smoother grocery workflow."}
            </p>

            {isStoreCheckout && !tierLoading && !isPremium && (
              <div className="mt-8 rounded-lg border border-orange-200 bg-orange-50 p-4 text-orange-950">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                      <p className="text-sm font-semibold">Premium would lower this checkout to {formatCurrency(premiumDeliveryTotals.grandTotal)}</p>
                      <p className="mt-1 text-sm text-orange-900/75">
                      Save {formatCurrency(premiumSavings)} on this basket with the {formatCurrency(PREMIUM_DELIVERY_FLAT_FEE)} flat delivery fee and 5% tax.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleCheckout}
                    disabled={isPending}
                    className="h-10 flex-shrink-0 bg-orange-600 text-white hover:bg-orange-700"
                  >
                    Upgrade
                  </Button>
                </div>
              </div>
            )}

            {isStoreCheckout ? (
              <div className={`${!tierLoading && !isPremium ? "mt-4" : "mt-8"} rounded-lg border border-border bg-background/60 p-4`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Receipt className="h-4 w-4 text-orange-600" />
                  Order Total
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <CheckoutRow label="Basket total" value={formatCurrency(activeDeliveryTotals.basketTotal)} />
                  <CheckoutRow
                    label={`${isPremium ? "Premium" : "Free"} delivery flat fee`}
                    value={formatCurrency(activeDeliveryTotals.flatFee)}
                  />
                  <CheckoutRow
                    label={`Estimated tax (${(activeDeliveryTotals.taxRate * 100).toFixed(0)}%)`}
                    value={formatCurrency(activeDeliveryTotals.tax)}
                  />
                  <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                    <span className="font-semibold text-foreground">Total due</span>
                    <span className="font-mono text-2xl font-semibold text-foreground">
                      {formatCurrency(activeDeliveryTotals.grandTotal)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  `${formatCurrency(PREMIUM_DELIVERY_FLAT_FEE)} flat delivery fee and 5% tax`,
                  "Automatic weekly meal planner",
                  "Price comparison across stores",
                  "Better nutrition insights",
                ].map((feature) => (
                  <div key={feature} className="flex items-start gap-3 rounded-lg border border-border bg-background/60 p-3">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            )}

            {checkoutError && (
              <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {checkoutError}
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={handleCheckout}
                disabled={isPending}
                className="h-12 gap-2 bg-orange-600 px-6 text-base font-semibold text-white hover:bg-orange-700"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    {isStoreCheckout ? "Continue to Checkout" : "Continue to Secure Checkout"}
                  </>
                )}
              </Button>
              <Button variant="outline" asChild className="h-12">
                <Link href={backHref}>{backLabel}</Link>
              </Button>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function CheckoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
