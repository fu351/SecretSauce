"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

const BUDGET_DASHBOARD_QUERY_KEY = ["budget", "dashboard"] as const

async function fetchBudgetDashboard() {
  const response = await fetch("/api/budget/dashboard", { credentials: "include" })
  if (response.status === 403) {
    return { dashboard: null, disabled: true as const }
  }
  if (!response.ok) {
    throw new Error("Failed to load budget dashboard")
  }
  const payload = await response.json()
  return { dashboard: payload.dashboard, disabled: false as const }
}

async function postJson(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed")
  }
  return payload
}

export function useBudgetDashboard(enabled = true) {
  return useQuery({
    queryKey: BUDGET_DASHBOARD_QUERY_KEY,
    queryFn: fetchBudgetDashboard,
    enabled,
    staleTime: 30_000,
  })
}

export function useCreateBudgetGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; category: string; targetCents: number; weeklyBudgetCents: number }) =>
      postJson("/api/budget/goals", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGET_DASHBOARD_QUERY_KEY }),
  })
}

export function useSwitchBudgetGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; category: string; targetCents: number; idempotencyKey?: string }) =>
      postJson("/api/budget/goals/switch", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGET_DASHBOARD_QUERY_KEY }),
  })
}

export function useLogBudgetSpend() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      amountCents: number
      sourceType: "manual" | "receipt"
      note?: string
      mediaAssetId?: string
      verificationTaskId?: string
      idempotencyKey?: string
    }) => postJson("/api/budget/spend", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGET_DASHBOARD_QUERY_KEY }),
  })
}

export function useAllocateWeeklySurplus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { weekStartDate: string; idempotencyKey?: string }) =>
      postJson(`/api/budget/weeks/${encodeURIComponent(input.weekStartDate)}/allocate`, {
        idempotencyKey: input.idempotencyKey,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGET_DASHBOARD_QUERY_KEY }),
  })
}

export function useDismissBudgetNudge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => postJson("/api/budget/nudges/dismiss"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGET_DASHBOARD_QUERY_KEY }),
  })
}
