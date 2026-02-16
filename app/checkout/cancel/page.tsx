"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function CheckoutCancelPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-white px-6 py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-amber-900">Payment Canceled</h1>
        <p className="mt-3 text-neutral-700">
          Your subscription has not been changed. You can try again whenever
          you&apos;re ready.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/checkout">Try Again</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/pricing">Back to Pricing</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}

