/**
 * EXAMPLE PAGE - Demonstrates tier-based access control
 * This shows how to use all the subscription infrastructure features
 * You can use this as a reference and delete it when you're done
 */

import { getUserTier, getUserSubscription } from "@/lib/auth/subscription"
import { TierGate, TierBadge } from "@/components/auth/tier-gate"
import { ExampleClientComponent } from "./client-component"
import Link from "next/link"

export default async function TierDemoPage() {
  // Server-side: Get user's subscription info
  const tier = await getUserTier()
  const subscription = await getUserSubscription()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="mb-4 inline-block text-sm text-blue-600 hover:text-blue-700">
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Tier-Based Access Demo
        </h1>
        <p className="text-gray-600 mb-8">
          This page demonstrates how to lock features behind subscription tiers
        </p>

        {/* Current Subscription Status */}
        <div className="rounded-lg bg-white p-6 shadow mb-8">
          <h2 className="text-lg font-semibold mb-4">Your Current Subscription</h2>
          <div className="space-y-2">
            <p>
              <span className="font-medium">Tier:</span>{" "}
              <TierBadge tier={tier || "free"} />
            </p>
            {subscription?.is_active && subscription.expires_at && (
              <p>
                <span className="font-medium">Expires:</span>{" "}
                {new Date(subscription.expires_at).toLocaleDateString()}
              </p>
            )}
            {!tier && (
              <p className="text-sm text-gray-500">
                Sign in to access more features
              </p>
            )}
          </div>
        </div>

        {/* Free Content - Everyone can see */}
        <div className="rounded-lg bg-white p-6 shadow mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Free Content</h2>
            <TierBadge tier="free" />
          </div>
          <p className="text-gray-600">
            This content is visible to everyone, including anonymous users.
          </p>
        </div>

        {/* Premium Content - Gated */}
        <div className="rounded-lg bg-white p-6 shadow mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Premium Content</h2>
            <TierBadge tier="premium" />
          </div>

          <TierGate requiredTier="premium">
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-4">
              <p className="text-orange-900 font-medium">
                🎉 You have premium access!
              </p>
              <p className="text-orange-700 text-sm mt-2">
                This content is only visible to Premium users.
              </p>
            </div>
          </TierGate>
        </div>


        {/* Client Component Examples */}
        <div className="rounded-lg bg-white p-6 shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">Client Component Examples</h2>
          <p className="text-gray-600 text-sm mb-4">
            The component below uses client-side hooks to check subscription status
          </p>
          <ExampleClientComponent />
        </div>

        {/* Server-side Conditional Rendering */}
        <div className="rounded-lg bg-white p-6 shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">
            Server-side Conditional Rendering
          </h2>

          {/* This uses server-side tier check - no loading state needed */}
          {tier === "free" || tier === null ? (
            <div className="text-gray-600">
              <p className="mb-2">You're on the free tier.</p>
              <Link
                href="/pricing"
                className="text-blue-600 hover:text-blue-700 underline"
              >
                Upgrade to Premium to unlock more features →
              </Link>
            </div>
          ) : (
            <div className="text-orange-600">
              <p>You have premium access! 🎉</p>
            </div>
          )}
        </div>

        {/* Implementation Guide */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-6">
          <h3 className="font-semibold text-blue-900 mb-3">
            How to Use This Infrastructure
          </h3>
          <div className="space-y-2 text-sm text-blue-800">
            <p>
              <strong>Server Components:</strong> Use{" "}
              <code className="bg-blue-100 px-1 rounded">requireTier("premium")</code> to
              protect entire pages
            </p>
            <p>
              <strong>Client Components:</strong> Use{" "}
              <code className="bg-blue-100 px-1 rounded">&lt;TierGate&gt;</code> or{" "}
              <code className="bg-blue-100 px-1 rounded">useHasAccess()</code> for UI
              elements
            </p>
            <p>
              <strong>Documentation:</strong> See{" "}
              <code className="bg-blue-100 px-1 rounded">
                docs/subscription-quick-reference.md
              </code>{" "}
              for full guide
            </p>
            <p>
              <strong>Testing:</strong> Grant yourself different tiers using SQL (see
              quick reference)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
