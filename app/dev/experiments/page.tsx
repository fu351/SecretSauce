import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import Link from "next/link"

export const dynamic = "force-dynamic"

type Experiment = {
  id: string
  name: string
  description: string | null
  hypothesis: string | null
  status: string
  target_user_tiers: string[] | null
  traffic_percentage: number | null
  primary_metric: string | null
  variants: Array<{
    id: string
    name: string
    is_control: boolean
    weight: number
  }>
}

const PAGE_SIZE = 1000
const VARIANT_CHUNK_SIZE = 200

type ExperimentRow = Omit<Experiment, "variants">
type ExperimentRpcRow = Omit<Experiment, "variants"> & {
  variants: unknown
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

function normalizeVariants(raw: unknown): Experiment["variants"] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: String(item.id || ""),
      name: String(item.name || "Unnamed Variant"),
      is_control: Boolean(item.is_control),
      weight: Number(item.weight || 0),
    }))
}

function normalizeExperimentRows(rows: ExperimentRpcRow[]): Experiment[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    hypothesis: row.hypothesis,
    status: row.status,
    target_user_tiers: row.target_user_tiers,
    traffic_percentage: row.traffic_percentage,
    primary_metric: row.primary_metric,
    variants: normalizeVariants(row.variants),
  }))
}

async function getExperimentsFromSchema(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
): Promise<Experiment[]> {
  const experiments: ExperimentRow[] = []
  let rangeStart = 0

  while (true) {
    const { data, error } = await supabase
      .schema("ab_testing")
      .from("experiments")
      .select(
        "id, name, description, hypothesis, status, target_user_tiers, traffic_percentage, primary_metric"
      )
      .order("created_at", { ascending: false })
      .range(rangeStart, rangeStart + PAGE_SIZE - 1)

    if (error) {
      console.error("Error fetching experiments:", error)
      return []
    }

    if (!data || data.length === 0) {
      break
    }

    experiments.push(...(data as ExperimentRow[]))

    if (data.length < PAGE_SIZE) {
      break
    }

    rangeStart += PAGE_SIZE
  }

  const experimentIds = experiments.map((experiment) => experiment.id)
  const allVariants: Array<{
    id: string
    name: string
    is_control: boolean
    weight: number
    experiment_id: string
  }> = []

  for (const idChunk of chunkArray(experimentIds, VARIANT_CHUNK_SIZE)) {
    if (idChunk.length === 0) {
      continue
    }

    const { data: variants, error: variantsError } = await supabase
      .schema("ab_testing")
      .from("variants")
      .select("id, name, is_control, weight, experiment_id")
      .in("experiment_id", idChunk)
      .order("weight", { ascending: false })

    if (variantsError) {
      console.error("Error fetching experiment variants:", variantsError)
      continue
    }

    allVariants.push(...(variants || []))
  }

  const variantsByExperiment = new Map<Experiment["id"], Experiment["variants"]>()
  for (const variant of allVariants) {
    const existing = variantsByExperiment.get(variant.experiment_id) || []
    existing.push({
      id: variant.id,
      name: variant.name,
      is_control: variant.is_control,
      weight: variant.weight,
    })
    variantsByExperiment.set(variant.experiment_id, existing)
  }

  return experiments.map((experiment) => ({
    ...experiment,
    variants: variantsByExperiment.get(experiment.id) || [],
  }))
}

async function getExperiments(): Promise<Experiment[]> {
  const supabase = createServiceSupabaseClient()

  const { data, error } = await supabase.rpc("dev_get_experiments")

  if (!error && data) {
    return normalizeExperimentRows(data as ExperimentRpcRow[])
  }

  if (error) {
    console.error("Error fetching experiments via dev_get_experiments:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
  }

  return getExperimentsFromSchema(supabase)
}

export default async function ExperimentsPage() {
  await requireAdmin()

  const experiments = await getExperiments()

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    scheduled: "bg-blue-100 text-blue-800",
    active: "bg-green-100 text-green-800",
    paused: "bg-yellow-100 text-yellow-800",
    completed: "bg-purple-100 text-purple-800",
    archived: "bg-red-100 text-red-800",
  }

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
            <h1 className="text-3xl font-bold text-gray-900">
              A/B Test Experiments
            </h1>
            <p className="mt-2 text-gray-600">
              Manage experiments and view analytics
            </p>
          </div>
          <Link
            href="/dev/experiments/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + New Experiment
          </Link>
        </div>

        {/* Experiments List */}
        <div className="space-y-4">
          {experiments.length === 0 ? (
            <div className="rounded-lg bg-white p-12 text-center shadow">
              <p className="text-gray-500">No experiments yet</p>
              <Link
                href="/dev/experiments/new"
                className="mt-4 inline-block text-blue-600 hover:text-blue-700"
              >
                Create your first experiment
              </Link>
            </div>
          ) : (
            experiments.map((experiment) => (
              <div
                key={experiment.id}
                className="rounded-lg bg-white p-6 shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {experiment.name}
                      </h3>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          statusColors[experiment.status] ||
                          "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {experiment.status}
                      </span>
                    </div>
                    {experiment.description && (
                      <p className="mt-2 text-sm text-gray-600">
                        {experiment.description}
                      </p>
                    )}
                    {experiment.hypothesis && (
                      <p className="mt-1 text-sm text-gray-500">
                        <span className="font-medium">Hypothesis:</span>{" "}
                        {experiment.hypothesis}
                      </p>
                    )}

                    {/* Variants */}
                    <div className="mt-4 flex gap-2">
                      {experiment.variants?.map((variant) => (
                        <div
                          key={variant.id}
                          className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{variant.name}</span>
                          {variant.is_control && (
                            <span className="ml-2 text-xs text-gray-500">
                              (Control)
                            </span>
                          )}
                          <span className="ml-2 text-xs text-gray-400">
                            {variant.weight}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Stats */}
                    <div className="mt-4 flex gap-6 text-sm text-gray-600">
                      {experiment.target_user_tiers && (
                        <div>
                          <span className="font-medium">Targets:</span>{" "}
                          {experiment.target_user_tiers.join(", ")}
                        </div>
                      )}
                      {experiment.traffic_percentage && (
                        <div>
                          <span className="font-medium">Traffic:</span>{" "}
                          {experiment.traffic_percentage}%
                        </div>
                      )}
                      {experiment.primary_metric && (
                        <div>
                          <span className="font-medium">Metric:</span>{" "}
                          {experiment.primary_metric}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/dev/experiments/${experiment.id}`}
                      className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
