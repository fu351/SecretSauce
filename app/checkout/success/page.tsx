"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { capturePosthogEvent } from "@/lib/analytics/posthog-client"

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")

  useEffect(() => {
    capturePosthogEvent("subscription_purchased", { session_id: sessionId ?? undefined })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white px-6 py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-emerald-900">Payment Successful</h1>
        <p className="mt-3 text-neutral-700">
          Your subscription checkout completed successfully.
        </p>
        {sessionId && (
          <p className="mt-4 break-all text-xs text-neutral-500">
            Session ID: {sessionId}
          </p>
        )}
        <div className="mt-8">
          <Button asChild>
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
