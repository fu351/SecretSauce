"use client"

import {
  useSubscription,
  useHasAccess,
  useIsPaying,
  useCurrentTier,
} from "@/hooks/use-subscription"
import { Loader2 } from "lucide-react"

export function ExampleClientComponent() {
  const { subscription, loading: subLoading } = useSubscription()
  const { hasAccess: hasPremium, loading: premiumLoading } =
    useHasAccess("premium")
  const { isPaying, loading: payingLoading } = useIsPaying()
  const { tier, isActive, loading: tierLoading } = useCurrentTier()

  if (subLoading || premiumLoading || payingLoading || tierLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading subscription status...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Hook: useSubscription */}
      <div className="rounded-lg bg-gray-50 p-4">
        <h3 className="font-medium text-sm mb-2">useSubscription()</h3>
        <pre className="text-xs overflow-auto">
          {JSON.stringify(subscription, null, 2)}
        </pre>
      </div>

      {/* Hook: useCurrentTier */}
      <div className="rounded-lg bg-gray-50 p-4">
        <h3 className="font-medium text-sm mb-2">useCurrentTier()</h3>
        <div className="text-sm space-y-1">
          <p>Tier: <strong>{tier}</strong></p>
          <p>Active: <strong>{isActive ? "Yes" : "No"}</strong></p>
        </div>
      </div>

      {/* Hook: useHasAccess */}
      <div className="rounded-lg bg-gray-50 p-4">
        <h3 className="font-medium text-sm mb-2">useHasAccess()</h3>
        <div className="text-sm space-y-1">
          <p>Premium access: <strong>{hasPremium ? "✅ Yes" : "❌ No"}</strong></p>
        </div>
      </div>

      {/* Hook: useIsPaying */}
      <div className="rounded-lg bg-gray-50 p-4">
        <h3 className="font-medium text-sm mb-2">useIsPaying()</h3>
        <p className="text-sm">
          Is paying customer: <strong>{isPaying ? "✅ Yes" : "❌ No"}</strong>
        </p>
      </div>

      {/* Conditional Buttons */}
      <div className="pt-4 space-y-2">
        <button className="w-full rounded bg-gray-600 px-4 py-2 text-white">
          Free Feature (Always Available)
        </button>

        <button
          disabled={!hasPremium}
          className="w-full rounded px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed bg-orange-600 text-white"
        >
          {hasPremium ? "Premium Feature (Unlocked)" : "Premium Feature (Locked)"}
        </button>
      </div>
    </div>
  )
}
