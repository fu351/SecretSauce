import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import Link from "next/link"
import ChallengesManager from "./challenges-manager"

export const dynamic = "force-dynamic"

async function getChallenges() {
  const supabase = createServiceSupabaseClient()
  const { data } = await supabase
    .from("challenges")
    .select("*")
    .order("starts_at", { ascending: false })
  return data ?? []
}

export default async function DevChallengesPage() {
  await requireAdmin()
  const challenges = await getChallenges()

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
            Create and manage challenges shown to users. Only one challenge is "active" at a time (now() falls within starts_at → ends_at).
          </p>
        </div>
        <ChallengesManager initialChallenges={challenges} />
      </div>
    </div>
  )
}
