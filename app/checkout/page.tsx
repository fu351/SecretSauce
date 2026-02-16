"use client"

import { useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function CheckoutPage() {
  const [isPending, startTransition] = useTransition()

  const handleCheckout = () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
