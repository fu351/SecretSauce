import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import ABTestingLabClient from "./tester-client"

export const dynamic = "force-dynamic"

type ExperimentOption = {
  id: string
  name: string
  status: string
}

type ExperimentRpcRow = {
  id: string
  name: string
  status: string
}

async function getExperimentOptions(): Promise<ExperimentOption[]> {
  const supabase = createServiceSupabaseClient()

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "dev_get_experiments"
  )

  if (!rpcError && rpcData) {
    return (rpcData as ExperimentRpcRow[])
      .map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  if (rpcError) {
    console.error("Error loading experiments for A/B lab via RPC:", {
      message: rpcError.message,
      details: rpcError.details,
      hint: rpcError.hint,
      code: rpcError.code,
    })
  }

  const { data, error } = await supabase
    .schema("ab_testing")
    .from("experiments")
    .select("id, name, status")
    .order("name")

  if (error) {
    console.error("Error loading experiments for A/B lab:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return []
  }

  return (data || []) as ExperimentOption[]
}

export default async function ABTestingLabPage() {
  await requireAdmin()
  const experiments = await getExperimentOptions()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dev"
          className="mb-2 inline-block text-sm text-blue-600 hover:text-blue-700"
        >
          ← Back to Dev Tools
        </Link>

        <h1 className="text-3xl font-bold text-gray-900">A/B Hook Test Lab</h1>
        <p className="mt-2 text-gray-600">
          Test `useExperiment` and `useFeatureFlag` directly against active
          experiments.
        </p>

        <ABTestingLabClient experiments={experiments} />
      </div>
    </div>
  )
}
