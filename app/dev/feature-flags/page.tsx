import { requireAdmin } from "@/lib/auth/admin"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function FeatureFlagsPage() {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link href="/dev" className="mb-2 inline-block text-sm text-blue-600 hover:text-blue-700">
            ← Back to Dev Tools
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Feature Flags</h1>
          <p className="mt-2 text-gray-600">Feature flags and A/B tests are managed in PostHog.</p>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h2 className="mb-2 text-lg font-semibold text-blue-900">PostHog Dashboard</h2>
          <p className="mb-4 text-sm text-blue-700">
            Create and manage feature flags, A/B experiments, and rollout rules in the PostHog dashboard.
          </p>
          <a
            href="https://us.posthog.com/feature_flags"
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Open PostHog Feature Flags →
          </a>
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Usage in Code</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <div>
              <strong>Boolean flag:</strong>
              <code className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs">
                {"const { isEnabled } = useFeatureFlag(\"my-flag-key\")"}
              </code>
            </div>
            <div>
              <strong>Multivariate / payload:</strong>
              <code className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs">
                {"const { config } = useExperiment(\"my-experiment-key\")"}
              </code>
            </div>
            <div>
              <strong>Direct PostHog access:</strong>
              <code className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs">
                {"const posthog = usePostHog()"}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
