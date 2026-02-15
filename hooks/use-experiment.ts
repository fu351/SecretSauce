"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ABTestingClient, type ABExperimentAssignment } from "@/lib/analytics"
import type { ABEventType } from "@/lib/analytics"

export interface UseExperimentOptions {
  enabled?: boolean
  autoTrackExposure?: boolean
  exposureEventName?: string
  exposureProperties?: Record<string, unknown>
}

export interface TrackExperimentEventOptions {
  eventName?: string
  eventValue?: number
  properties?: Record<string, unknown>
}

const DEFAULT_EXPOSURE_EVENT_NAME = "experiment_exposure"
const DEFAULT_CLICK_EVENT_NAME = "experiment_click"
const DEFAULT_CONVERSION_EVENT_NAME = "experiment_conversion"

interface UseExperimentState {
  assignment: ABExperimentAssignment | null
  loading: boolean
  error: string | null
}

export function useExperiment(
  experimentIdentifier: string,
  options: UseExperimentOptions = {},
) {
  const {
    enabled = true,
    autoTrackExposure = true,
    exposureEventName = DEFAULT_EXPOSURE_EVENT_NAME,
    exposureProperties,
  } = options

  const [state, setState] = useState<UseExperimentState>({
    assignment: null,
    loading: enabled && !!experimentIdentifier,
    error: null,
  })

  const mountedRef = useRef(true)
  const exposureTrackedRef = useRef(false)
  const activeIdentifier = experimentIdentifier.trim()

  const trackCustom = useCallback(
    async (
      eventType: ABEventType,
      eventName: string,
      eventOptions: TrackExperimentEventOptions = {},
    ) => {
      if (!state.assignment) {
        return false
      }

      try {
        await ABTestingClient.trackExperimentEvent({
          experimentId: state.assignment.experimentId,
          variantId: state.assignment.variantId,
          eventType,
          eventName,
          eventValue: eventOptions.eventValue,
          properties: eventOptions.properties,
        })
        return true
      } catch (error) {
        console.error("[useExperiment] Failed to track event:", error)
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : String(error),
          }))
        }
        return false
      }
    },
    [state.assignment],
  )

  const trackExposure = useCallback(
    async (eventOptions: TrackExperimentEventOptions = {}) => {
      const tracked = await trackCustom(
        "exposure",
        eventOptions.eventName || exposureEventName,
        {
          ...eventOptions,
          properties: {
            ...exposureProperties,
            ...eventOptions.properties,
          },
        },
      )

      if (tracked) {
        exposureTrackedRef.current = true
      }

      return tracked
    },
    [exposureEventName, exposureProperties, trackCustom],
  )

  const trackClick = useCallback(
    (eventOptions: TrackExperimentEventOptions = {}) =>
      trackCustom("click", eventOptions.eventName || DEFAULT_CLICK_EVENT_NAME, eventOptions),
    [trackCustom],
  )

  const trackConversion = useCallback(
    (eventOptions: TrackExperimentEventOptions = {}) =>
      trackCustom(
        "conversion",
        eventOptions.eventName || DEFAULT_CONVERSION_EVENT_NAME,
        eventOptions,
      ),
    [trackCustom],
  )

  const refresh = useCallback(async () => {
    if (!enabled || !activeIdentifier) {
      if (mountedRef.current) {
        setState({
          assignment: null,
          loading: false,
          error: null,
        })
      }
      return
    }

    if (mountedRef.current) {
      setState((current) => ({
        ...current,
        loading: true,
        error: null,
      }))
    }

    try {
      const assignment =
        await ABTestingClient.resolveExperiment(activeIdentifier)

      if (mountedRef.current) {
        setState({
          assignment,
          loading: false,
          error: null,
        })
      }
    } catch (error) {
      if (mountedRef.current) {
        setState({
          assignment: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }, [activeIdentifier, enabled])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    exposureTrackedRef.current = false
  }, [activeIdentifier])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!autoTrackExposure || !state.assignment || exposureTrackedRef.current) {
      return
    }

    void trackExposure()
  }, [autoTrackExposure, state.assignment, trackExposure])

  return {
    assignment: state.assignment,
    config: state.assignment?.variantConfig || {},
    experimentId: state.assignment?.experimentId,
    experimentName: state.assignment?.experimentName,
    variantId: state.assignment?.variantId,
    variantName: state.assignment?.variantName,
    isControl: state.assignment?.isControl ?? false,
    loading: state.loading,
    error: state.error,
    refresh,
    trackExposure,
    trackClick,
    trackConversion,
    trackCustom,
  }
}
