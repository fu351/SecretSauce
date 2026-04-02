"use client"

import { useFeatureFlagEnabled, useFeatureFlagPayload } from "posthog-js/react"

export interface UseFeatureFlagOptions {
  enabled?: boolean
  fallback?: boolean
}

export function useFeatureFlag(flagKey: string, options: UseFeatureFlagOptions = {}) {
  const { enabled = true, fallback = false } = options

  const isEnabled = useFeatureFlagEnabled(enabled ? flagKey : "") ?? fallback
  const payload = useFeatureFlagPayload(enabled ? flagKey : "") as Record<string, unknown> | null | undefined
  const config: Record<string, unknown> = payload && typeof payload === "object" ? payload : {}

  const getConfigValue = <T,>(key: string, fallbackValue: T): T => {
    const value = config[key]
    return value === undefined ? fallbackValue : (value as T)
  }

  return {
    isEnabled: isEnabled ?? fallback,
    config,
    loading: false,
    error: null,
    getConfigValue,
  }
}
