"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DEFAULT_USER_FEATURE_PREFERENCES,
  type UserFeaturePreferences,
} from "@/lib/foundation/preferences"

type PreferencesResponse = {
  preferences: UserFeaturePreferences
}

const QUERY_KEY = ["foundation", "feature-preferences"] as const

async function fetchFeaturePreferences(): Promise<UserFeaturePreferences> {
  const response = await fetch("/api/foundation/preferences", {
    credentials: "include",
  })

  if (response.status === 401 || response.status === 404) {
    return DEFAULT_USER_FEATURE_PREFERENCES
  }

  if (!response.ok) {
    throw new Error("Failed to load feature preferences")
  }

  const payload = (await response.json()) as PreferencesResponse
  return payload.preferences ?? DEFAULT_USER_FEATURE_PREFERENCES
}

async function patchFeaturePreferences(
  updates: Partial<UserFeaturePreferences>,
): Promise<UserFeaturePreferences> {
  const response = await fetch("/api/foundation/preferences", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.error ?? "Failed to update feature preferences")
  }

  const payload = (await response.json()) as PreferencesResponse
  return payload.preferences
}

export function useFeaturePreferences(enabled = true) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchFeaturePreferences,
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const mutation = useMutation({
    mutationFn: patchFeaturePreferences,
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<UserFeaturePreferences>(QUERY_KEY)
      queryClient.setQueryData<UserFeaturePreferences>(QUERY_KEY, {
        ...(previous ?? DEFAULT_USER_FEATURE_PREFERENCES),
        ...updates,
      })
      return { previous }
    },
    onError: (_error, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous)
      }
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(QUERY_KEY, preferences)
    },
  })

  return {
    preferences: query.data ?? DEFAULT_USER_FEATURE_PREFERENCES,
    loading: query.isLoading,
    error: query.error,
    updatePreferences: mutation.mutate,
    updatePreferencesAsync: mutation.mutateAsync,
    updating: mutation.isPending,
  }
}
