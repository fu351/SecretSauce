import { requireAdmin } from "@/lib/auth/admin"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function ABTestingLabPage() {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link href="/dev" className="mb-2 inline-block text-sm text-blue-600 hover:text-blue-700">
            ← Back to Dev Tools
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">A/B Testing Lab</h1>
          <p className="mt-2 text-gray-600">A/B tests are now managed in PostHog.</p>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h2 className="mb-2 text-lg font-semibold text-blue-900">PostHog Experiments</h2>
          <p className="mb-4 text-sm text-blue-700">
            Create multivariate experiments, set rollout percentages, and view results in PostHog.
          </p>
          <a
            href="https://us.posthog.com/experiments"
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Open PostHog Experiments →
          </a>
        </div>
      </div>
    </div>
  )
}
