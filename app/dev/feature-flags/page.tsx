import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import Link from "next/link"

export const dynamic = "force-dynamic"

type FeatureVariant = {
  id: string
  name: string
  config: Record<string, unknown> | null
  is_control: boolean
  weight: number
  experiment_id: string
}

type FeatureFlag = {
  id: string
  name: string
  description: string | null
  status: string
  target_user_tiers: string[] | null
  target_anonymous: boolean | null
  variants: FeatureVariant[]
}

async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const supabase = createServiceSupabaseClient()

  // Load experiments and variants separately to avoid relation parser issues.
  const { data: experiments, error } = await supabase
    .schema("ab_testing")
    .from("experiments")
    .select("id, name, description, status, target_user_tiers, target_anonymous")
    .order("name")

  if (error) {
    console.error("Error fetching feature flags:", error)
    return []
  }

  if (!experiments || experiments.length === 0) {
    return []
  }

  const experimentIds = experiments.map((experiment) => experiment.id)
  const { data: variants, error: variantsError } = await supabase
    .schema("ab_testing")
    .from("variants")
    .select("id, name, config, is_control, weight, experiment_id")
    .in("experiment_id", experimentIds)
    .order("weight", { ascending: false })

  if (variantsError) {
    console.error("Error fetching feature flag variants:", variantsError)
  }

  const variantsByExperiment = new Map<string, FeatureVariant[]>()
  for (const variant of variants || []) {
    const existing = variantsByExperiment.get(variant.experiment_id) || []
    existing.push(variant)
    variantsByExperiment.set(variant.experiment_id, existing)
  }

  return experiments.map((experiment) => ({
    ...experiment,
    variants: variantsByExperiment.get(experiment.id) || [],
  }))
}

export default async function FeatureFlagsPage() {
  await requireAdmin()

  const features = await getFeatureFlags()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href="/dev"
              className="mb-2 inline-block text-sm text-blue-600 hover:text-blue-700"
            >
              ← Back to Dev Tools
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Feature Flags</h1>
            <p className="mt-2 text-gray-600">
              Control feature access by user tier
            </p>
          </div>
          <Link
            href="/dev/experiments/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + New Feature Flag
          </Link>
        </div>

        {/* Common Feature Flags Examples */}
        <div className="mb-8 rounded-lg bg-blue-50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-blue-900">
            💡 Common Feature Flags
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded bg-white p-4">
              <h3 className="font-medium text-gray-900">
                Advanced Recipe Filters
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Premium users get advanced filtering options
              </p>
              <div className="mt-2 text-xs text-gray-500">
                Target: Premium
              </div>
            </div>
            <div className="rounded bg-white p-4">
              <h3 className="font-medium text-gray-900">AI Meal Planning</h3>
              <p className="mt-1 text-sm text-gray-600">
                AI-powered weekly meal plans
              </p>
              <div className="mt-2 text-xs text-gray-500">Target: Premium</div>
            </div>
            <div className="rounded bg-white p-4">
              <h3 className="font-medium text-gray-900">Unlimited Favorites</h3>
              <p className="mt-1 text-sm text-gray-600">
                Free: 10 limit, Premium: unlimited
              </p>
              <div className="mt-2 text-xs text-gray-500">Target: All tiers</div>
            </div>
          </div>
        </div>

        {/* Feature Flags List */}
        <div className="space-y-4">
          {features.length === 0 ? (
            <div className="rounded-lg bg-white p-12 text-center shadow">
              <p className="text-gray-500">No feature flags configured yet</p>
              <p className="mt-2 text-sm text-gray-400">
                Feature flags are managed through the A/B testing system
              </p>
              <Link
                href="/dev/experiments"
                className="mt-4 inline-block text-blue-600 hover:text-blue-700"
              >
                Go to Experiments →
              </Link>
            </div>
          ) : (
            features.map((feature) => (
              <div
                key={feature.id}
                className="rounded-lg bg-white p-6 shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {feature.name}
                      </h3>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          feature.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {feature.status}
                      </span>
                    </div>

                    {feature.description && (
                      <p className="mt-2 text-sm text-gray-600">
                        {feature.description}
                      </p>
                    )}

                    {/* Targeting Info */}
                    <div className="mt-4 space-y-2 text-sm">
                      {feature.target_user_tiers && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">
                            Tiers:
                          </span>
                          <div className="flex gap-2">
                            {feature.target_user_tiers.map((tier: string) => (
                              <span
                                key={tier}
                                className="rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800"
                              >
                                {tier}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {feature.target_anonymous !== null && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">
                            Anonymous Users:
                          </span>
                          <span
                            className={`rounded px-2 py-1 text-xs ${
                              feature.target_anonymous
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {feature.target_anonymous ? "Allowed" : "Blocked"}
                          </span>
                        </div>
                      )}

                      {/* Config Preview */}
                      {feature.variants.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700">
                            Config:
                          </span>
                          <pre className="mt-1 rounded bg-gray-50 p-3 text-xs text-gray-600">
                            {JSON.stringify(
                              feature.variants[0].config,
                              null,
                              2
                            )}
                          </pre>
                          <p className="mt-1 text-xs text-gray-500">
                            Variant: {feature.variants[0].name}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ml-4">
                    <button className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200">
                      Configure
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick Guide */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            📚 Quick Setup Guide
          </h2>
          <div className="space-y-3 text-sm text-gray-600">
            <div>
              <strong>1. Create a feature flag as an experiment:</strong>
              <code className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs">
                {'target_user_tiers = ["premium"]'}
              </code>
            </div>
            <div>
              <strong>2. Add a single variant with your config:</strong>
              <code className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs">
                config = {'{"feature_enabled": true, "limit": 100}'}
              </code>
            </div>
            <div>
              <strong>3. Use in your app:</strong>
              <code className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs">
                {'const { isEnabled, config } = useFeatureFlag("Feature Name")'}
              </code>
            </div>
            <div className="pt-2">
              <strong>4. For custom events and variants:</strong>
              <code className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs">
                {'useExperiment("experiment-id")'}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
