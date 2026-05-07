/**
 * /training/receipts
 * ──────────────────
 * Verification queue for receipts captured into the training set.
 *
 * Layout: split-view — receipt image on the left, editable parsed fields
 * on the right. Three actions per receipt:
 *   - Confirm:  candidate parse is correct, no changes needed
 *   - Save edits: user edited fields; save the corrected version
 *   - Reject:   the parse is unsalvageable; don't include in training set
 *
 * Goal: minimize keystrokes. Pre-fill every field with the candidate
 * parse so the user usually only checks a checkbox and clicks Confirm.
 */
"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"

interface ReceiptItem {
  name: string
  quantity: number
  price: number
}

interface CandidateParse {
  store: string
  date: string | null
  items: ReceiptItem[]
  subtotal?: number | null
  taxes?: Array<{ rate: number; amount: number }>
  total?: number | null
}

interface QueueRow {
  id: string
  image_storage_path: string | null
  candidate_parse: CandidateParse
  parse_confidence: number | null
  strategy_used: string | null
  strategies_tried: string[]
  disposition: string
  created_at: string
}

interface QueueResponse {
  success: boolean
  queue: QueueRow[]
  counts: { auto_accepted: number; needs_review: number; rejected: number }
}

export default function TrainingQueuePage() {
  const { isLoaded, isSignedIn } = useAuth()
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [counts, setCounts] = useState({ auto_accepted: 0, needs_review: 0, rejected: 0 })
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [edited, setEdited] = useState<CandidateParse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch("/api/receipt/training/queue?limit=25")
      const j: QueueResponse = await r.json()
      if (!j.success) throw new Error("queue load failed")
      setQueue(j.queue)
      setCounts(j.counts)
      setActiveIdx(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Load active row's signed image URL whenever the active row changes.
  useEffect(() => {
    const row = queue[activeIdx]
    if (!row) {
      setImageUrl(null)
      setEdited(null)
      return
    }
    setEdited(JSON.parse(JSON.stringify(row.candidate_parse))) // deep copy for editing
    let cancelled = false
    fetch(`/api/receipt/training/verify?id=${row.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j?.success) setImageUrl(j.signedImageUrl ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [queue, activeIdx])

  useEffect(() => {
    if (isLoaded && isSignedIn) loadQueue()
  }, [isLoaded, isSignedIn, loadQueue])

  const submit = async (action: "confirm" | "edit" | "reject") => {
    const row = queue[activeIdx]
    if (!row) return
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, any> = { id: row.id, action }
      if (action === "edit" && edited) body.edited_parse = edited
      const r = await fetch("/api/receipt/training/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j?.success) throw new Error(j?.error ?? "verify failed")
      // Move to the next row; refresh the queue when we run out.
      const next = activeIdx + 1
      if (next >= queue.length) {
        await loadQueue()
      } else {
        setActiveIdx(next)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!isLoaded) return <div className="p-6">Loading…</div>
  if (!isSignedIn) return <div className="p-6">Please sign in.</div>
  if (loading) return <div className="p-6">Loading queue…</div>

  const row = queue[activeIdx]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Receipt training queue</h1>
        <p className="text-sm text-gray-600 mt-1">
          {counts.needs_review} pending · {counts.auto_accepted} auto-accepted ·{" "}
          {counts.rejected} rejected
        </p>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {!row ? (
        <div className="p-8 text-center text-gray-500 border rounded">
          🎉 No receipts pending review. Upload a few from{" "}
          <a className="text-blue-600 underline" href="/store">
            the store page
          </a>{" "}
          and they&apos;ll show up here.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {/* Image pane */}
          <div className="border rounded p-2 bg-gray-50">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="receipt"
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            ) : (
              <div className="text-sm text-gray-500 p-4">Loading image…</div>
            )}
          </div>

          {/* Edit pane */}
          <div>
            <div className="text-xs text-gray-500 mb-2">
              {activeIdx + 1} / {queue.length} · strategy:{" "}
              {row.strategy_used ?? "?"} · confidence:{" "}
              {row.parse_confidence != null ? row.parse_confidence.toFixed(2) : "?"}
            </div>

            {edited && (
              <div className="space-y-3">
                <Field
                  label="Store"
                  value={edited.store}
                  onChange={(v) => setEdited({ ...edited, store: v })}
                />
                <Field
                  label="Date (YYYY-MM-DD)"
                  value={edited.date ?? ""}
                  onChange={(v) => setEdited({ ...edited, date: v || null })}
                />
                <NumField
                  label="Subtotal"
                  value={edited.subtotal ?? null}
                  onChange={(v) => setEdited({ ...edited, subtotal: v })}
                />
                <NumField
                  label="Total"
                  value={edited.total ?? null}
                  onChange={(v) => setEdited({ ...edited, total: v })}
                />

                <div>
                  <div className="font-medium mb-1">
                    Items ({edited.items.length})
                  </div>
                  <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
                    {edited.items.map((it, i) => (
                      <div key={i} className="grid grid-cols-12 gap-1 items-center">
                        <input
                          className="col-span-7 border rounded px-2 py-1 text-sm"
                          value={it.name}
                          onChange={(e) => {
                            const next = [...edited.items]
                            next[i] = { ...next[i], name: e.target.value }
                            setEdited({ ...edited, items: next })
                          }}
                        />
                        <input
                          className="col-span-2 border rounded px-2 py-1 text-sm"
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={(e) => {
                            const next = [...edited.items]
                            next[i] = { ...next[i], quantity: Number(e.target.value) || 1 }
                            setEdited({ ...edited, items: next })
                          }}
                        />
                        <input
                          className="col-span-2 border rounded px-2 py-1 text-sm"
                          type="number"
                          step="0.01"
                          value={it.price}
                          onChange={(e) => {
                            const next = [...edited.items]
                            next[i] = { ...next[i], price: Number(e.target.value) || 0 }
                            setEdited({ ...edited, items: next })
                          }}
                        />
                        <button
                          className="col-span-1 text-red-600 text-sm"
                          onClick={() => {
                            const next = edited.items.filter((_, j) => j !== i)
                            setEdited({ ...edited, items: next })
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="mt-2 text-sm text-blue-600"
                    onClick={() =>
                      setEdited({
                        ...edited,
                        items: [...edited.items, { name: "", quantity: 1, price: 0 }],
                      })
                    }
                  >
                    + add item
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <button
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                onClick={() => submit("confirm")}
                disabled={busy}
              >
                ✓ Looks right
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                onClick={() => submit("edit")}
                disabled={busy}
              >
                💾 Save edits
              </button>
              <button
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-50 ml-auto"
                onClick={() => submit("reject")}
                disabled={busy}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="text-sm text-gray-600">{props.label}</div>
      <input
        className="w-full border rounded px-2 py-1"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}

function NumField(props: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <label className="block">
      <div className="text-sm text-gray-600">{props.label}</div>
      <input
        className="w-full border rounded px-2 py-1"
        type="number"
        step="0.01"
        value={props.value ?? ""}
        onChange={(e) => {
          const v = e.target.value
          props.onChange(v === "" ? null : Number(v))
        }}
      />
    </label>
  )
}
