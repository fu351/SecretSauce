"use client"

import { useCallback, useMemo, useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

/**
 * Hook to fetch recipe titles by their IDs
 * Caches results to avoid repeated queries
 */
export function useRecipeTitles(recipeIds: string[]) {
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const uniqueIds = useMemo(() => [...new Set(recipeIds)], [recipeIds])

  useEffect(() => {
    const fetchTitles = async () => {
      if (uniqueIds.length === 0) return

      setLoading(true)
      try {
        const { data, error } = await supabase
          .from("recipes")
          .select("id, title")
          .in("id", uniqueIds)

        if (error) throw error

        const titleMap: Record<string, string> = {}
        data?.forEach((recipe) => {
          titleMap[recipe.id] = recipe.title
        })
        setTitles(titleMap)
      } catch (error) {
        console.error("Failed to fetch recipe titles:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTitles()
  }, [uniqueIds])

  return { titles, loading }
}
