"use client"

import { useMemo, useState } from "react"
import { useExperiment, useFeatureFlag } from "@/hooks"

type ExperimentOption = {
  id: string
  name: string
  status: string
}

type Mode = "experiment" | "feature-flag"

type Props = {
  experiments: ExperimentOption[]
}

export default function ABTestingLabClient({ experiments }: Props) {
  const [mode, setMode] = useState<Mode>("experiment")
  const [identifier, setIdentifier] = useState("")
  const [flagKey, setFlagKey] = useState("feature_enabled")
  const [fallbackEnabled, setFallbackEnabled] = useState(false)
  const [autoTrackExposure, setAutoTrackExposure] = useState(true)
  const [eventPrefix, setEventPrefix] = useState("dev_lab")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const normalizedIdentifier = identifier.trim()
  const normalizedFlagKey = flagKey.trim() || "feature_enabled"
  const canRun = normalizedIdentifier.length > 0

  const exposureEventName = `${eventPrefix.trim() || "dev_lab"}_exposure`
  const clickEventName = `${eventPrefix.trim() || "dev_lab"}_click`
  const conversionEventName = `${eventPrefix.trim() || "dev_lab"}_conversion`

  const experiment = useExperiment(normalizedIdentifier, {
    enabled: canRun && mode === "experiment",
    autoTrackExposure,
    exposureEventName,
  })

  const featureFlag = useFeatureFlag(normalizedIdentifier, {
    enabled: canRun && mode === "feature-flag",
    autoTrackExposure,
    exposureEventName,
    flagKey: normalizedFlagKey,
    fallback: fallbackEnabled,
  })

  const active = mode === "experiment" ? experiment : featureFlag

  const statusColor = useMemo(() => {
    if (active.error) return "text-red-700"
    if (active.loading) return "text-blue-700"
    if (active.assignment) return "text-emerald-700"
    return "text-gray-600"
  }, [active.assignment, active.error, active.loading])

  const handleAction = async (action: () => Promise<boolean>, label: string) => {
    setStatusMessage(null)
    const success = await action()
    setStatusMessage(success ? `${label} tracked.` : `${label} not tracked.`)
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Configuration</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Mode
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("experiment")}
                className={`rounded px-3 py-2 text-sm ${
                  mode === "experiment"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                useExperiment
              </button>
              <button
                type="button"
                onClick={() => setMode("feature-flag")}
                className={`rounded px-3 py-2 text-sm ${
                  mode === "feature-flag"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                useFeatureFlag
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Experiment ID or Name
            </label>
            <input
              type="text"
              list="dev-ab-lab-experiments"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Paste experiment UUID or exact name"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <datalist id="dev-ab-lab-experiments">
              {experiments.map((item) => (
                <option key={`${item.id}-id`} value={item.id} />
              ))}
              {experiments.map((item) => (
                <option key={`${item.id}-name`} value={item.name} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Event Prefix
            </label>
            <input
              type="text"
              value={eventPrefix}
              onChange={(event) => setEventPrefix(event.target.value)}
              placeholder="dev_lab"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Feature Flag Key
            </label>
            <input
              type="text"
              value={flagKey}
              onChange={(event) => setFlagKey(event.target.value)}
              placeholder="feature_enabled"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Used by `useFeatureFlag` to evaluate `isEnabled`.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoTrackExposure}
              onChange={(event) => setAutoTrackExposure(event.target.checked)}
            />
            Auto track exposure
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={fallbackEnabled}
              onChange={(event) => setFallbackEnabled(event.target.checked)}
            />
            Feature flag fallback enabled
          </label>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Runtime State</h2>
          <button
            type="button"
            onClick={() => void active.refresh()}
            disabled={!canRun}
            className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Refresh Assignment
          </button>
        </div>

        <p className={`text-sm ${statusColor}`}>
          {active.error
            ? `Error: ${active.error}`
            : active.loading
              ? "Loading assignment..."
              : active.assignment
                ? `Assigned to "${active.variantName}" (${active.variantId})`
                : "No assignment loaded yet."}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded bg-gray-50 p-3 text-sm">
            <div>
              <span className="font-medium">Experiment:</span>{" "}
              {active.experimentName || "—"}
            </div>
            <div>
              <span className="font-medium">Experiment ID:</span>{" "}
              {active.experimentId || "—"}
            </div>
            <div>
              <span className="font-medium">Variant:</span>{" "}
              {active.variantName || "—"}
            </div>
            <div>
              <span className="font-medium">Control:</span>{" "}
              {active.isControl ? "Yes" : "No"}
            </div>
            {mode === "feature-flag" ? (
              <div>
                <span className="font-medium">isEnabled:</span>{" "}
                {featureFlag.isEnabled ? "true" : "false"}
              </div>
            ) : null}
          </div>

          <div className="rounded bg-gray-50 p-3 text-xs text-gray-700">
            <div className="mb-1 font-medium">Variant Config</div>
            <pre className="overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(active.config, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Event Actions</h2>
        <p className="mt-1 text-sm text-gray-600">
          Emit test events into `ab_testing.events` for this assignment.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void handleAction(
                () => active.trackExposure({ eventName: exposureEventName }),
                "Exposure",
              )
            }
            disabled={!canRun || !active.assignment}
            className="rounded bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Track Exposure
          </button>

          <button
            type="button"
            onClick={() =>
              void handleAction(
                () => active.trackClick({ eventName: clickEventName }),
                "Click",
              )
            }
            disabled={!canRun || !active.assignment}
            className="rounded bg-blue-100 px-3 py-2 text-sm text-blue-700 hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Track Click
          </button>

          <button
            type="button"
            onClick={() =>
              void handleAction(
                () =>
                  active.trackConversion({
                    eventName: conversionEventName,
                    eventValue: 1,
                  }),
                "Conversion",
              )
            }
            disabled={!canRun || !active.assignment}
            className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Track Conversion
          </button>

          {mode === "feature-flag" ? (
            <button
              type="button"
              onClick={() =>
                void handleAction(
                  () =>
                    featureFlag.trackEnabledClick({
                      eventName: `${eventPrefix.trim() || "dev_lab"}_enabled_click`,
                    }),
                  "Enabled Click",
                )
              }
              disabled={!canRun || !active.assignment}
              className="rounded bg-violet-100 px-3 py-2 text-sm text-violet-700 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Track Enabled Click
            </button>
          ) : null}
        </div>

        {statusMessage ? (
          <p className="mt-3 text-sm text-gray-700">{statusMessage}</p>
        ) : null}
      </div>
    </div>
  )
}
