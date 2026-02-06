"use client"

import { Button } from "@/components/ui/button"
import { useTransition } from "react"

export default function CheckoutPage() {
  const [isPending, startTransition] = useTransition()

  const handleCheckout = () => {
    startTransition(async () => {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const session = await response.json()

      if (response.ok) {
        if (session.url) {
          window.location.href = session.url
        }
      } else {
        console.error("Failed to create checkout session:", session.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold mb-8">Checkout</h1>
      <Button onClick={handleCheckout} disabled={isPending}>
        {isPending ? "Redirecting..." : "Proceed to Payment"}
      </Button>
    </div>
  )
}