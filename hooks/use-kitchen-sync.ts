"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

const KITCHEN_SYNC_KEY = ["social", "kitchen-sync"] as const
const COOK_CHECK_DRAFTS_KEY = ["social", "cook-check-drafts"] as const
const SOCIAL_PREFS_KEY = ["social", "preferences"] as const

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error ?? "Request failed")
  return payload
}

export function useKitchenSyncFeed(enabled = true) {
  return useQuery({
    queryKey: KITCHEN_SYNC_KEY,
    enabled,
    queryFn: async () => readJson(await fetch("/api/social/kitchen-sync", { credentials: "include" })),
    staleTime: 30_000,
  })
}

export function useCookCheckDrafts(enabled = true) {
  return useQuery({
    queryKey: COOK_CHECK_DRAFTS_KEY,
    enabled,
    queryFn: async () => readJson(await fetch("/api/social/cook-checks/drafts", { credentials: "include" })),
    staleTime: 30_000,
  })
}

export function useCreateCookCheckDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) =>
      readJson(
        await fetch("/api/social/cook-checks/drafts", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COOK_CHECK_DRAFTS_KEY })
      queryClient.invalidateQueries({ queryKey: KITCHEN_SYNC_KEY })
    },
  })
}

export function usePublishCookCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { cookCheckId: string; caption?: string; visibility?: string }) =>
      readJson(
        await fetch(`/api/social/cook-checks/${encodeURIComponent(input.cookCheckId)}/publish`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COOK_CHECK_DRAFTS_KEY })
      queryClient.invalidateQueries({ queryKey: KITCHEN_SYNC_KEY })
    },
  })
}

export function useSkipCookCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (cookCheckId: string) =>
      readJson(
        await fetch(`/api/social/cook-checks/${encodeURIComponent(cookCheckId)}/skip`, {
          method: "POST",
          credentials: "include",
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COOK_CHECK_DRAFTS_KEY }),
  })
}

export function useToggleCookCheckReaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { cookCheckId: string; reactionKey: string; active: boolean }) =>
      readJson(
        await fetch(`/api/social/cook-checks/${encodeURIComponent(input.cookCheckId)}/reactions`, {
          method: input.active ? "DELETE" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reactionKey: input.reactionKey }),
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KITCHEN_SYNC_KEY }),
  })
}

export function useSocialPreferences(enabled = true) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: SOCIAL_PREFS_KEY,
    enabled,
    queryFn: async () => readJson(await fetch("/api/social/preferences", { credentials: "include" })),
  })
  const mutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) =>
      readJson(
        await fetch("/api/social/preferences", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SOCIAL_PREFS_KEY }),
  })
  return { ...query, updatePreferences: mutation.mutate, updating: mutation.isPending }
}
