"use client"

import { useFeatureFlagPayload, usePostHog } from "posthog-js/react"

export interface UseExperimentOptions {
  enabled?: boolean
}

export function useExperiment(flagKey: string, options: UseExperimentOptions = {}) {
  const { enabled = true } = options
  const posthog = usePostHog()
  const payload = useFeatureFlagPayload(enabled ? flagKey : "") as Record<string, unknown> | null | undefined

  const variantConfig: Record<string, unknown> = payload && typeof payload === "object" ? payload : {}
  const variantName = (variantConfig.variant_name as string | undefined) ?? null
  const isControl = (variantConfig.is_control as boolean | undefined) ?? false
  const variantKey = (enabled ? posthog?.getFeatureFlag(flagKey) : null) as string | null | undefined ?? null

  const trackConversion = (properties?: Record<string, unknown>) => {
    posthog?.capture("experiment_conversion", { flag_key: flagKey, ...properties })
  }

  const trackClick = (properties?: Record<string, unknown>) => {
    posthog?.capture("experiment_click", { flag_key: flagKey, ...properties })
  }

  return {
    variantConfig,
    variantName,
    variantKey,
    isControl,
    config: variantConfig,
    loading: false,
    error: null,
    trackConversion,
    trackClick,
  }
}
