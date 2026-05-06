"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { RecipeReliabilityTier, RecipeFeedbackTag } from "@/lib/social/recipe-feedback"

type PeerScoreResponse = {
  peerScore: {
    recipeId: string
    submittedCount: number
    successCount: number
    successRate: number | null
    successPercentage: number | null
    reliabilityTier: RecipeReliabilityTier
    topTags: Array<{ tag: RecipeFeedbackTag; count: number }>
    computedAt: string
  }
}

const TIER_LABELS: Record<RecipeReliabilityTier, string> = {
  early: "Early signal",
  building: "Building signal",
  tested: "Tested",
}

const TAG_DISPLAY: Record<RecipeFeedbackTag, string> = {
  too_salty: "too salty",
  not_salty_enough: "needed more salt",
  too_spicy: "too spicy",
  not_spicy_enough: "needed more heat",
  bland: "bland",
  too_sweet: "too sweet",
  took_longer: "took longer",
  too_hard: "harder than expected",
  easier_than_expected: "easier than expected",
  portion_too_small: "small portions",
  portion_too_large: "large portions",
  ingredient_swap: "ingredient swaps",
  unclear_steps: "unclear steps",
  worked_well: "worked well",
  budget_friendly: "budget friendly",
  good_for_meal_prep: "meal prep friendly",
  would_make_again: "would make again",
}

function cooksLabel(n: number): string {
  return n === 1 ? "1 cook" : `${n} cooks`
}

export function RecipePeerSuccess({ recipeId }: { recipeId: string }) {
  const [data, setData] = useState<PeerScoreResponse["peerScore"] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/recipes/${recipeId}/peer-score`)
        if (!res.ok) {
          setError("Peer score unavailable")
          return
        }
        const json = (await res.json()) as PeerScoreResponse
        if (!cancelled) setData(json.peerScore)
      } catch {
        if (!cancelled) setError("Peer score unavailable")
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [recipeId])

  if (error || !data) return null

  const { submittedCount, successPercentage, reliabilityTier, topTags } = data
  const headline =
    successPercentage !== null
      ? `${successPercentage}% success · ${cooksLabel(submittedCount)}`
      : `${TIER_LABELS.early} · ${cooksLabel(submittedCount)}`

  return (
    <Card aria-label="Cook success">
      <CardContent className="space-y-2 py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Cook success</span>
          <Badge variant="outline">{TIER_LABELS[reliabilityTier]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Based on feedback from people who actually cooked this recipe. Separate from reviews and star
          ratings.
        </p>
        <p className="text-base">{headline}</p>
        {topTags.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Most common notes: {topTags.map((t) => TAG_DISPLAY[t.tag]).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
