"use client"

import { useTransition, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

export default function CheckoutPage() {
  const [isPending, startTransition] = useTransition()
  const searchParams = useSearchParams()
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
          return
        }

        const url = typeof payload.url === "string" ? payload.url : null
        if (url) {
          window.location.href = url
        } else {
          console.error("[checkout-page] Missing checkout URL in response", payload)
        }
      } catch (error) {
        console.error("[checkout-page] Checkout request failed:", error)
      }
    })
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-50 to-white px-6 py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-neutral-900">Upgrade to Premium</h1>
        <p className="mt-3 text-neutral-600">
          Continue to Stripe checkout to activate your premium subscription.
        </p>

        {pricingInfo.totalAmount !== undefined && pricingInfo.totalAmount > 0 && (
          <div className="mt-6 rounded-lg bg-neutral-50 p-4">
            <h2 className="text-sm font-medium text-neutral-700">Shopping Cart Summary</h2>
            <div className="mt-2 space-y-1">
              {pricingInfo.itemCount !== undefined && (
                <p className="text-sm text-neutral-600">
                  Items: {pricingInfo.itemCount}
                </p>
              )}
              <p className="text-lg font-semibold text-neutral-900">
                Total: ${pricingInfo.totalAmount.toFixed(2)}
              </p>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Special discount will be applied at checkout for new subscribers
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button onClick={handleCheckout} disabled={isPending}>
            {isPending ? "Redirecting..." : "Proceed to Payment"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/pricing">Back to Pricing</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
