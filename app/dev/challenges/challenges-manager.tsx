"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type ChallengeType = "star" | "community"

type Challenge = {
  id: string
  title: string
  description: string | null
  points: number
  starts_at: string
  ends_at: string
  created_at: string
  challenge_type: string
  winner_count: number
}

type Template = {
  id: string
  title: string
  description: string | null
  points: number
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

export default function ChallengesManager({
  initialChallenges,
  initialTemplates,
}: {
  initialChallenges: Challenge[]
  initialTemplates: Template[]
}) {
  const router = useRouter()
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges)
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Challenge form state
  const now = new Date()
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [challengeType, setChallengeType] = useState<ChallengeType>("community")
  const [winnerCount, setWinnerCount] = useState(3)
  const [startsAt, setStartsAt] = useState(toLocalDatetimeValue(now.toISOString()))
  const [endsAt, setEndsAt] = useState(toLocalDatetimeValue(weekLater.toISOString()))

  // Template form state
  const [templateTitle, setTemplateTitle] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [templatePoints, setTemplatePoints] = useState(100)

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null) }
    else { setSuccess(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccess(null) }, 4000)
  }

  function applyTemplate(t: Template) {
    setTitle(t.title)
    setDescription(t.description ?? "")
    setChallengeType("community")
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
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          challenge_type: challengeType,
          winner_count: challengeType === "star" ? winnerCount : 0,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create challenge")
      setChallenges((prev) => [json.challenge, ...prev])
      setTitle("")
      setDescription("")
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

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/dev/challenges/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: templateTitle,
          description: templateDescription || null,
          points: templatePoints,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create template")
      setTemplates((prev) => [...prev, json.template].sort((a, b) => a.title.localeCompare(b.title)))
      setTemplateTitle("")
      setTemplateDescription("")
      setTemplatePoints(100)
      flash("Template added to pool!")
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Unknown error", true)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Remove this template from the pool?")) return
    setLoading(true)
    try {
      const res = await fetch("/api/dev/challenges/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? "Failed to delete template")
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      flash("Template removed.")
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Unknown error", true)
    } finally {
      setLoading(false)
    }
  }

  const starChallenges      = challenges.filter((c) => c.challenge_type === "star")
  const communityChallenges = challenges.filter((c) => c.challenge_type === "community")

  return (
    <div className="space-y-8">
      {/* Feedback banner */}
      {(error || success) && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {error ?? success}
        </div>
      )}

      {/* Create challenge form */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Create Challenge</h2>
        <p className="mb-4 text-sm text-gray-500">
          <strong>Star</strong> challenges are staff-curated — winners are chosen by staff.{" "}
          <strong>Community</strong> challenges are picked from the template pool and winners are chosen by community vote.
          Both types can run in parallel.
        </p>

        {/* Type selector */}
        <div className="mb-5 flex gap-3">
          {(["star", "community"] as ChallengeType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setChallengeType(t)}
              className={`flex-1 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                challengeType === t
                  ? t === "star"
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-blue-400 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              {t === "star" ? "⭐ Star Challenge" : "🗳️ Community Challenge"}
            </button>
          ))}
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Pre-fill from template (community only) */}
          {challengeType === "community" && templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pre-fill from template</label>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100"
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}

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

          <div className={`grid grid-cols-1 gap-4 ${challengeType === "star" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {challengeType === "star" && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  # Winners <span className="text-gray-400 font-normal">(staff picks)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={winnerCount}
                  onChange={(e) => setWinnerCount(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
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
            className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              challengeType === "star"
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Creating…" : challengeType === "star" ? "Create Star Challenge" : "Create Community Challenge"}
          </button>
        </form>
      </div>

      {/* Star challenges list */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center gap-2">
          <span className="text-lg">⭐</span>
          <h2 className="text-lg font-semibold text-gray-900">
            Star Challenges ({starChallenges.length})
          </h2>
          <span className="ml-auto text-xs text-gray-400">Staff-curated · winners chosen by staff</span>
        </div>
        {starChallenges.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">No star challenges yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {starChallenges.map((c) => {
              const active = isActive(c)
              return (
                <li key={c.id} className="flex items-start justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{c.title}</span>
                      {active && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Active
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="mt-0.5 text-sm text-gray-500 truncate">{c.description}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-400">
                      <span>{c.points} pts</span>
                      <span>{c.winner_count} winner{c.winner_count !== 1 ? "s" : ""}</span>
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

      {/* Community challenges list */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center gap-2">
          <span className="text-lg">🗳️</span>
          <h2 className="text-lg font-semibold text-gray-900">
            Community Challenges ({communityChallenges.length})
          </h2>
          <span className="ml-auto text-xs text-gray-400">Community vote decides winners</span>
        </div>
        {communityChallenges.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">No community challenges yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {communityChallenges.map((c) => {
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

      {/* Community challenge template pool */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Community Challenge Template Pool</h2>
          <p className="mt-1 text-sm text-gray-500">
            Store reusable challenge ideas here. When creating a community challenge, pick from these templates to pre-fill the form.
          </p>
        </div>

        {/* Add template form */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <form onSubmit={handleCreateTemplate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600">Title *</label>
                <input
                  type="text"
                  required
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  placeholder="e.g. Pantry Rescue"
                  className="mt-1 block w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Points</label>
                <input
                  type="number"
                  min={1}
                  value={templatePoints}
                  onChange={(e) => setTemplatePoints(Number(e.target.value))}
                  className="mt-1 block w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Description</label>
              <input
                type="text"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Short description"
                className="mt-1 block w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Adding…" : "Add to Pool"}
            </button>
          </form>
        </div>

        {templates.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">No templates yet. Add some above.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-4 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-gray-900 text-sm">{t.title}</span>
                  {t.description && (
                    <p className="text-xs text-gray-500 truncate">{t.description}</p>
                  )}
                  <span className="text-xs text-gray-400">{t.points} pts</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => applyTemplate(t)}
                    className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                  >
                    Use
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(t.id)}
                    disabled={loading}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
