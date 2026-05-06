"use client"

import { useMemo, useState } from "react"
import type { ApiAvailabilityStatus } from "@/lib/dev/api-availability"

type ApiAvailabilityPanelProps = {
  initialEnabled: boolean
  initialApis: ApiAvailabilityStatus[]
}

export function ApiAvailabilityPanel({ initialEnabled, initialApis }: ApiAvailabilityPanelProps) {
  const [togglesEnabled, setTogglesEnabled] = useState(initialEnabled)
  const [apis, setApis] = useState(initialApis)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const disabledCount = useMemo(() => apis.filter((api) => !api.enabled).length, [apis])

  async function updateApi(key: string, enabled: boolean) {
    setPendingKey(key)
    setMessage(null)
    try {
      const response = await fetch("/api/dev/api-availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update API availability.")
      }
      setTogglesEnabled(Boolean(payload.enabled))
      setApis(payload.apis)
      setMessage(enabled ? "API enabled." : "API disabled.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update API availability.")
    } finally {
      setPendingKey(null)
    }
  }

  async function resetAll() {
    setPendingKey("reset")
    setMessage(null)
    try {
      const response = await fetch("/api/dev/api-availability", { method: "DELETE" })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to reset API availability.")
      }
      setTogglesEnabled(Boolean(payload.enabled))
      setApis(payload.apis)
      setMessage("All APIs reset to enabled.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to reset API availability.")
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">API availability</h2>
            <p className="mt-1 text-sm text-gray-600">
              {togglesEnabled
                ? `${disabledCount} API${disabledCount === 1 ? "" : "s"} currently disabled`
                : "Availability toggles are disabled in this environment"}
            </p>
          </div>
          <button
            type="button"
            onClick={resetAll}
            disabled={!togglesEnabled || pendingKey === "reset"}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset all
          </button>
        </div>
        {message ? <p className="mt-4 text-sm text-gray-600">{message}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {apis.map((api) => {
          const isPending = pendingKey === api.key
          return (
            <div key={api.key} className="rounded-lg bg-white p-6 shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">{api.label}</h3>
                  <p className="mt-1 break-all font-mono text-xs text-gray-500">{api.path}</p>
                  <p className="mt-3 text-sm text-gray-600">{api.description}</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={api.enabled}
                    disabled={!togglesEnabled || isPending}
                    onChange={(event) => updateApi(api.key, event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                  />
                  {api.enabled ? "Enabled" : "Disabled"}
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
