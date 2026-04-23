import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import Link from "next/link"
import ChallengesManager from "./challenges-manager"

export const dynamic = "force-dynamic"

async function getData() {
  const supabase = createServiceSupabaseClient()
  const [{ data: challenges }, { data: templates }] = await Promise.all([
    supabase.from("challenges").select("*").order("starts_at", { ascending: false }),
    supabase.from("community_challenge_templates").select("*").order("title", { ascending: true }),
  ])
  return { challenges: challenges ?? [], templates: templates ?? [] }
}

export default async function DevChallengesPage() {
  await requireAdmin()
  const { challenges, templates } = await getData()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/dev" className="text-sm text-gray-500 hover:text-gray-700">
            ← Dev Tools
          </Link>
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🏆 Social Challenges</h1>
          <p className="mt-2 text-gray-600">
            Manage challenges. <strong>Star challenges</strong> are staff-curated with staff-selected winners.{" "}
            <strong>Community challenges</strong> run from a reusable template pool with community-voted winners.
            Both types can be active in parallel.
          </p>
        </div>
        <ChallengesManager initialChallenges={challenges} initialTemplates={templates} />
      </div>
    </div>
  )
}
