import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createServerClient } from "@/lib/database/supabase-server"

type Awaitable<T> = T | Promise<T>

type PageProps = {
  params: Awaitable<{ id: string }>
  searchParams?: Awaitable<{
    saved?: string
    error?: string
    variantSaved?: string
    variantError?: string
  }>
}

type Tier = "free" | "premium"
type ExperimentStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "archived"

type Experiment = {
  id: string
  name: string
  description: string | null
  hypothesis: string | null
  status: ExperimentStatus
  start_date: string | null
  end_date: string | null
  traffic_percentage: number | null
  target_user_tiers: Tier[] | null
  target_anonymous: boolean | null
  primary_metric: string | null
  variants: Array<{
    id: string
    name: string
    is_control: boolean | null
    weight: number | null
    config: unknown
  }>
}

type ExperimentRpcRow = Omit<Experiment, "variants"> & {
  variants: unknown
}

const STATUS_OPTIONS: ExperimentStatus[] = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
  "archived",
]

const TIER_OPTIONS: Tier[] = ["free", "premium"]

const toNumberOrNull = (value: FormDataEntryValue | null): number | null => {
  if (typeof value !== "string") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const toNullableText = (value: FormDataEntryValue | null): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const toDateInputValue = (value: string | null): string => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 16)
}

const fromDateInputValue = (value: FormDataEntryValue | null): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
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
      is_control:
        typeof item.is_control === "boolean" ? item.is_control : null,
      weight: typeof item.weight === "number" ? item.weight : null,
      config:
        item.config && typeof item.config === "object" ? item.config : {},
    }))
}

function normalizeExperimentRow(row: ExperimentRpcRow): Experiment {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    hypothesis: row.hypothesis,
    status: row.status,
    start_date: row.start_date,
    end_date: row.end_date,
    traffic_percentage: row.traffic_percentage,
    target_user_tiers: row.target_user_tiers,
    target_anonymous: row.target_anonymous,
    primary_metric: row.primary_metric,
    variants: normalizeVariants(row.variants),
  }
}

async function getExperiment(id: string): Promise<Experiment | null> {
  const supabase = createServerClient()

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "dev_get_experiments"
  )

  if (!rpcError && rpcData) {
    const matching = (rpcData as ExperimentRpcRow[]).find(
      (experiment) => experiment.id === id
    )

    if (matching) {
      return normalizeExperimentRow(matching)
    }
  }

  if (rpcError) {
    console.error("Error fetching experiment via dev_get_experiments:", {
      message: rpcError.message,
      details: rpcError.details,
      hint: rpcError.hint,
      code: rpcError.code,
    })
  }

  const { data: experiment, error } = await supabase
    .schema("ab_testing")
    .from("experiments")
    .select(
      "id, name, description, hypothesis, status, start_date, end_date, traffic_percentage, target_user_tiers, target_anonymous, primary_metric"
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("Error fetching experiment:", error)
    return null
  }

  if (!experiment) {
    return null
  }

  const { data: variants, error: variantsError } = await supabase
    .schema("ab_testing")
    .from("variants")
    .select("id, name, is_control, weight, config")
    .eq("experiment_id", id)
    .order("weight", { ascending: false })

  if (variantsError) {
    console.error("Error fetching variants:", variantsError)
  }

  return {
    ...(experiment as Omit<Experiment, "variants">),
    variants: (variants || []) as Experiment["variants"],
  }
}

export default async function ExperimentEditPage(props: PageProps) {
  await requireAdmin()

  const { id } = await props.params
  const query = (await props.searchParams) || {}
  const experiment = await getExperiment(id)

  if (!experiment) {
    notFound()
  }

  async function updateExperiment(formData: FormData) {
    "use server"

    await requireAdmin()

    const experimentId = String(formData.get("id") || "")
    const name = toNullableText(formData.get("name"))
    const status = String(formData.get("status")) as ExperimentStatus

    if (!experimentId || !name || !STATUS_OPTIONS.includes(status)) {
      redirect(`/dev/experiments/${id}?error=invalid_input`)
    }

    const trafficRaw = toNumberOrNull(formData.get("traffic_percentage"))
    const trafficPercentage =
      trafficRaw === null ? null : Math.min(100, Math.max(0, trafficRaw))

    const targetUserTiers = formData
      .getAll("target_user_tiers")
      .map((value) => String(value))
      .filter((tier): tier is Tier => TIER_OPTIONS.includes(tier as Tier))

    const supabase = createServerClient()
    const { error } = await supabase
      .schema("ab_testing")
      .from("experiments")
      .update({
        name,
        description: toNullableText(formData.get("description")),
        hypothesis: toNullableText(formData.get("hypothesis")),
        status,
        start_date: fromDateInputValue(formData.get("start_date")),
        end_date: fromDateInputValue(formData.get("end_date")),
        traffic_percentage: trafficPercentage,
        target_user_tiers: targetUserTiers.length > 0 ? targetUserTiers : null,
        target_anonymous: formData.get("target_anonymous") === "on",
        primary_metric: toNullableText(formData.get("primary_metric")),
      })
      .eq("id", experimentId)

    if (error) {
      console.error("Error updating experiment:", error)
      redirect(`/dev/experiments/${id}?error=save_failed`)
    }

    revalidatePath("/dev/experiments")
    revalidatePath(`/dev/experiments/${id}`)
    redirect(`/dev/experiments/${id}?saved=1`)
  }

  async function updateVariant(formData: FormData) {
    "use server"

    await requireAdmin()

    const experimentId = String(formData.get("experiment_id") || "")
    const variantId = String(formData.get("variant_id") || "")
    const name = toNullableText(formData.get("variant_name"))
    const weightRaw = toNumberOrNull(formData.get("variant_weight"))
    const weight = weightRaw === null ? null : Math.min(100, Math.max(0, weightRaw))
    const isControl = formData.get("variant_is_control") === "on"
    const configRaw = String(formData.get("variant_config") || "").trim()

    if (!experimentId || !variantId || !name) {
      redirect(`/dev/experiments/${id}?variantError=invalid_input`)
    }

    let parsedConfig: Record<string, unknown> = {}
    if (configRaw.length > 0) {
      try {
        const parsed = JSON.parse(configRaw)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          redirect(`/dev/experiments/${id}?variantError=invalid_config_shape`)
        }
        parsedConfig = parsed as Record<string, unknown>
      } catch {
        redirect(`/dev/experiments/${id}?variantError=invalid_json`)
      }
    }

    const supabase = createServerClient()
    const { error } = await supabase
      .schema("ab_testing")
      .from("variants")
      .update({
        name,
        is_control: isControl,
        weight,
        config: parsedConfig,
      })
      .eq("id", variantId)
      .eq("experiment_id", experimentId)

    if (error) {
      console.error("Error updating variant:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
      redirect(`/dev/experiments/${id}?variantError=save_failed`)
    }

    revalidatePath("/dev/experiments")
    revalidatePath(`/dev/experiments/${id}`)
    redirect(`/dev/experiments/${id}?variantSaved=1`)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dev/experiments"
          className="mb-2 inline-block text-sm text-blue-600 hover:text-blue-700"
        >
          ← Back to Experiments
        </Link>

        <h1 className="text-3xl font-bold text-gray-900">Edit Experiment</h1>
        <p className="mt-2 text-gray-600">
          Update experiment settings and targeting for this test.
        </p>

        {query.saved === "1" ? (
          <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Experiment saved.
          </div>
        ) : null}
        {query.error ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Could not save experiment (`{query.error}`).
          </div>
        ) : null}
        {query.variantSaved === "1" ? (
          <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Variant saved.
          </div>
        ) : null}
        {query.variantError ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Could not save variant (`{query.variantError}`).
          </div>
        ) : null}

        <form
          action={updateExperiment}
          className="mt-6 space-y-6 rounded-lg bg-white p-8 shadow"
        >
          <input type="hidden" name="id" value={experiment.id} />

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Experiment ID
            </label>
            <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
              {experiment.id}
            </code>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              type="text"
              name="name"
              defaultValue={experiment.name}
              required
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              name="status"
              defaultValue={experiment.status}
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              name="description"
              defaultValue={experiment.description || ""}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Hypothesis
            </label>
            <textarea
              name="hypothesis"
              defaultValue={experiment.hypothesis || ""}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                type="datetime-local"
                name="start_date"
                defaultValue={toDateInputValue(experiment.start_date)}
                className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                End Date
              </label>
              <input
                type="datetime-local"
                name="end_date"
                defaultValue={toDateInputValue(experiment.end_date)}
                className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Traffic Percentage
            </label>
            <input
              type="number"
              name="traffic_percentage"
              min={0}
              max={100}
              step={0.01}
              defaultValue={experiment.traffic_percentage ?? 100}
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Primary Metric
            </label>
            <input
              type="text"
              name="primary_metric"
              defaultValue={experiment.primary_metric || ""}
              placeholder="e.g. signup_rate"
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Target User Tiers
            </label>
            <div className="space-y-2">
              {TIER_OPTIONS.map((tier) => (
                <label key={tier} className="flex items-center">
                  <input
                    type="checkbox"
                    name="target_user_tiers"
                    value={tier}
                    defaultChecked={experiment.target_user_tiers?.includes(tier)}
                    className="mr-2 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 capitalize">{tier}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                name="target_anonymous"
                defaultChecked={experiment.target_anonymous ?? true}
                className="mr-2 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                Include anonymous users
              </span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
            >
              Save Changes
            </button>
            <Link
              href="/dev/experiments"
              className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>
          </div>
        </form>

        <div className="mt-6 rounded-lg bg-white p-8 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Variants</h2>
          <p className="mt-1 text-sm text-gray-600">
            Edit variant metadata and JSON config used by the frontend.
          </p>

          <div className="mt-4 space-y-4">
            {experiment.variants.length === 0 ? (
              <p className="text-sm text-gray-500">No variants configured.</p>
            ) : (
              experiment.variants.map((variant) => (
                <form
                  key={variant.id}
                  action={updateVariant}
                  className="space-y-4 rounded border border-gray-200 bg-gray-50 p-4"
                >
                  <input type="hidden" name="experiment_id" value={experiment.id} />
                  <input type="hidden" name="variant_id" value={variant.id} />

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Variant ID
                    </label>
                    <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                      {variant.id}
                    </code>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Name *
                      </label>
                      <input
                        type="text"
                        name="variant_name"
                        defaultValue={variant.name}
                        required
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Weight
                      </label>
                      <input
                        type="number"
                        name="variant_weight"
                        min={0}
                        max={100}
                        step={0.01}
                        defaultValue={variant.weight ?? 0}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        name="variant_is_control"
                        defaultChecked={variant.is_control ?? false}
                        className="mr-2 rounded border-gray-300"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Control variant
                      </span>
                    </label>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Config (JSON Object)
                    </label>
                    <textarea
                      name="variant_config"
                      defaultValue={JSON.stringify(variant.config, null, 2)}
                      rows={6}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      This form updates this variant only.
                    </div>
                    <button
                      type="submit"
                      className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
                    >
                      Save Variant
                    </button>
                  </div>
                </form>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
