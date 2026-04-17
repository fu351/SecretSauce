"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Challenge = {
  id: string
  title: string
  description: string | null
  points: number
  starts_at: string
  ends_at: string
  created_at: string
}

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function isActive(c: Challenge) {
  const now = Date.now()
  return new Date(c.starts_at).getTime() <= now && new Date(c.ends_at).getTime() >= now
}

export default function ChallengesManager({ initialChallenges }: { initialChallenges: Challenge[] }) {
  const router = useRouter()
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const now = new Date()
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [points, setPoints] = useState(100)
  const [startsAt, setStartsAt] = useState(toLocalDatetimeValue(now.toISOString()))
  const [endsAt, setEndsAt] = useState(toLocalDatetimeValue(weekLater.toISOString()))

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null) }
    else { setSuccess(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccess(null) }, 4000)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/dev/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          points,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create challenge")
      setChallenges((prev) => [json.challenge, ...prev])
      setTitle("")
      setDescription("")
      setPoints(100)
      flash("Challenge created!")
      router.refresh()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Unknown error", true)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this challenge and all its entries?")) return
    setLoading(true)
    try {
      const res = await fetch("/api/dev/challenges", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? "Failed to delete")
      }
      setChallenges((prev) => prev.filter((c) => c.id !== id))
      flash("Challenge deleted.")
      router.refresh()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Unknown error", true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Feedback banner */}
      {(error || success) && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {error ?? success}
        </div>
      )}

      {/* Create form */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Challenge</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Taco Tuesday Showdown"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description shown to users"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Points</label>
              <input
                type="number"
                min={1}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Starts at *</label>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Ends at *</label>
              <input
                type="datetime-local"
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Challenge"}
          </button>
        </form>
      </div>

      {/* Challenges list */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            All Challenges ({challenges.length})
          </h2>
        </div>
        {challenges.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">No challenges yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {challenges.map((c) => {
              const active = isActive(c)
              return (
                <li key={c.id} className="flex items-start justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{c.title}</span>
                      {active && (
                        <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Active
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="mt-0.5 text-sm text-gray-500 truncate">{c.description}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-400">
                      <span>{c.points} pts</span>
                      <span>{formatDate(c.starts_at)} → {formatDate(c.ends_at)}</span>
                      <span className="font-mono">{c.id}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={loading}
                    className="shrink-0 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
