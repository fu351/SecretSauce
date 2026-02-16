"use client"

import { useMemo, useState } from "react"

type SeedResponse = {
  succeeded?: Array<{ title: string; dbId?: string }>
  failed?: Array<{ title: string; error: string }>
  skipped?: Array<{ title: string; reason: string }>
  error?: string
}

type Props = {
  defaultAuthorId?: string | null
}

export default function SeedMockRecipesButton({ defaultAuthorId }: Props) {
  const [isSeeding, setIsSeeding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const normalizedAuthorId = useMemo(() => {
    const trimmed = defaultAuthorId?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : null
  }, [defaultAuthorId])

  const handleSeed = async () => {
    setIsSeeding(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch("/api/dev/seed-recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authorId: normalizedAuthorId,
        }),
      })

      const data = (await response.json().catch(() => ({}))) as SeedResponse

      if (!response.ok) {
        setError(data.error ?? `Seed request failed (${response.status})`)
        return
      }

      const succeeded = data.succeeded?.length ?? 0
      const skipped = data.skipped?.length ?? 0
      const failed = data.failed?.length ?? 0
      setMessage(`Seeded ${succeeded}. Skipped ${skipped}. Failed ${failed}.`)
    } catch (seedError) {
      setError(seedError instanceof Error ? seedError.message : "Unexpected seed error")
    } finally {
      setIsSeeding(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSeed}
        disabled={isSeeding}
        className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSeeding ? "Seeding Mock Recipes..." : "Seed Mock Recipes"}
      </button>
      {normalizedAuthorId ? (
        <p className="text-xs text-gray-500">Author from env: {normalizedAuthorId}</p>
      ) : (
        <p className="text-xs text-amber-700">
          Missing `NEXT_PUBLIC_DEV_EXPERIMENT_CREATED_BY_UUID`; API fallback author selection will be used.
        </p>
      )}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  )
}
