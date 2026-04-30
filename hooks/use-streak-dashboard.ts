"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

const STREAK_DASHBOARD_QUERY_KEY = ["streaks", "dashboard"] as const

async function fetchStreakDashboard() {
  const response = await fetch("/api/streaks/dashboard", { credentials: "include" })
  if (!response.ok) throw new Error("Failed to load streak dashboard")
  const payload = await response.json()
  return { dashboard: payload.dashboard }
}

async function postJson(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error ?? "Request failed")
  return payload
}

export function useStreakDashboard(enabled = true) {
  return useQuery({
    queryKey: STREAK_DASHBOARD_QUERY_KEY,
    queryFn: fetchStreakDashboard,
    enabled,
    staleTime: 30_000,
  })
}

export function useManualConfirmStreakMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input?: { occurredOn?: string; recipeId?: string; idempotencyKey?: string }) =>
      postJson("/api/streaks/manual-confirm", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STREAK_DASHBOARD_QUERY_KEY }),
  })
}

export function useCreateStreakVerification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input?: { mediaAssetId?: string; idempotencyKey?: string }) =>
      postJson("/api/streaks/verification/create", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STREAK_DASHBOARD_QUERY_KEY }),
  })
}

export function useConfirmStreakVerification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { verificationTaskId: string; occurredOn?: string; recipeId?: string; idempotencyKey?: string }) =>
      postJson(`/api/streaks/verification/${encodeURIComponent(input.verificationTaskId)}/confirm`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STREAK_DASHBOARD_QUERY_KEY }),
  })
}

export function useUseStreakFreeze() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input?: { streakDate?: string; idempotencyKey?: string }) => postJson("/api/streaks/freeze/use", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STREAK_DASHBOARD_QUERY_KEY }),
  })
}

export function useApplyStreakGrace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input?: { streakDate?: string; idempotencyKey?: string }) => postJson("/api/streaks/grace/apply", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STREAK_DASHBOARD_QUERY_KEY }),
  })
}
