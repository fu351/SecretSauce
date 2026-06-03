"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getRecommendations } from "@/lib/recipe-rec"
import type { RecommendationConfig, ScoredRecipe, HeuristicWeights, RecipeFilters } from "@/lib/recipe-rec"

interface UseRecipeRecommendationsConfig {
  userId: string | null
  weights?: Partial<HeuristicWeights>
  filters?: Partial<RecipeFilters>
  limit?: number
  enabled?: boolean
}

export function useRecipeRecommendations({
  userId,
  weights,
  filters,
  limit,
  enabled = true,
}: UseRecipeRecommendationsConfig) {
  const queryClient = useQueryClient()

  const query = useQuery<ScoredRecipe[]>({
    queryKey: [
      "recipe-recommendations",
      userId,
      filters?.cuisines,
      filters?.mealTypes,
      filters?.maxPrepMinutes,
      filters?.maxDifficulty,
      filters?.dietaryTags,
      filters?.minMatchRatio,
      limit,
    ],
    queryFn: () => {
      if (!userId) return []
      return getRecommendations({
        userId,
        weights: weights as HeuristicWeights | undefined,
        filters: filters as RecipeFilters | undefined,
        limit,
      })
    },
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["recipe-recommendations"] })
  }

  return {
    recommendations: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  }
}
