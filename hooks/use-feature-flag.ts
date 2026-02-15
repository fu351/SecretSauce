"use client"

import { useMemo } from "react"
import {
  useExperiment,
  type TrackExperimentEventOptions,
  type UseExperimentOptions,
} from "./use-experiment"

export interface UseFeatureFlagOptions
  extends Pick<
    UseExperimentOptions,
    "enabled" | "autoTrackExposure" | "exposureEventName" | "exposureProperties"
  > {
  flagKey?: string
  fallback?: boolean
}

export function useFeatureFlag(
  experimentIdentifier: string,
  options: UseFeatureFlagOptions = {},
) {
  const {
    flagKey = "feature_enabled",
    fallback = false,
    enabled,
    autoTrackExposure,
    exposureEventName,
    exposureProperties,
  } = options

  const experiment = useExperiment(experimentIdentifier, {
    enabled,
    autoTrackExposure,
    exposureEventName,
    exposureProperties,
  })

  const isEnabled = useMemo(() => {
    const primary = experiment.config[flagKey]
    if (typeof primary === "boolean") {
      return primary
    }

    const secondary = experiment.config.enabled
    if (typeof secondary === "boolean") {
      return secondary
    }

    return fallback
  }, [experiment.config, fallback, flagKey])

  const getConfigValue = <T,>(key: string, fallbackValue: T): T => {
    const value = experiment.config[key]
    return value === undefined ? fallbackValue : (value as T)
  }

  const trackEnabledClick = (eventOptions: TrackExperimentEventOptions = {}) => {
    if (!isEnabled) {
      return Promise.resolve(false)
    }

    return experiment.trackClick(eventOptions)
  }

  return {
    ...experiment,
    isEnabled,
    flagKey,
    getConfigValue,
    trackEnabledClick,
  }
}
