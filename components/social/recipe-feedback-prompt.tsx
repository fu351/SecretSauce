"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks"
import {
  RECIPE_FEEDBACK_TAGS,
  type RecipeFeedbackOutcome,
  type RecipeFeedbackTag,
} from "@/lib/social/recipe-feedback"

type PromptStage = "choose" | "tweaks" | "done"

const TAG_LABELS: Record<RecipeFeedbackTag, string> = {
  too_salty: "Too salty",
  not_salty_enough: "Needed more salt",
  too_spicy: "Too spicy",
  not_spicy_enough: "Needed more heat",
  bland: "Bland",
  too_sweet: "Too sweet",
  took_longer: "Took longer than expected",
  too_hard: "Harder than expected",
  easier_than_expected: "Easier than expected",
  portion_too_small: "Portion too small",
  portion_too_large: "Portion too large",
  ingredient_swap: "I swapped ingredients",
  unclear_steps: "Steps unclear",
  worked_well: "Worked well",
  budget_friendly: "Budget friendly",
  good_for_meal_prep: "Good for meal prep",
  would_make_again: "Would make again",
}

const MAX_SELECTED_TAGS = 6

export type RecipeFeedbackPromptProps = {
  recipeTryId: string
  recipeTitle?: string | null
  onComplete?: (result: { outcome: RecipeFeedbackOutcome; tags: RecipeFeedbackTag[] }) => void
  onDismiss?: () => void
}

export function RecipeFeedbackPrompt({
  recipeTryId,
  recipeTitle,
  onComplete,
  onDismiss,
}: RecipeFeedbackPromptProps) {
  const { toast } = useToast()
  const [stage, setStage] = useState<PromptStage>("choose")
  const [submitting, setSubmitting] = useState(false)
  const [selectedTags, setSelectedTags] = useState<RecipeFeedbackTag[]>([])

  const title = recipeTitle ? `How did "${recipeTitle}" go?` : "How did this recipe go?"

  function toggleTag(tag: RecipeFeedbackTag) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag)
      if (prev.length >= MAX_SELECTED_TAGS) return prev
      return [...prev, tag]
    })
  }

  async function submit(outcome: RecipeFeedbackOutcome, tags: RecipeFeedbackTag[]) {
    if (submitting) return
    setSubmitting(true)
    try {
      const endpoint =
        outcome === "skipped_feedback"
          ? `/api/social/recipe-tries/${recipeTryId}/feedback/skip`
          : `/api/social/recipe-tries/${recipeTryId}/feedback`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: outcome === "skipped_feedback" ? JSON.stringify({}) : JSON.stringify({ outcome, tags }),
      })
      if (!res.ok) {
        const message = (await res.json().catch(() => ({})))?.error ?? "Could not save feedback."
        toast({ title: "Feedback not saved", description: String(message), variant: "destructive" })
        return
      }
      setStage("done")
      onComplete?.({ outcome, tags })
    } catch (error) {
      toast({
        title: "Network error",
        description: "Please try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (stage === "done") {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Thanks — your feedback helps other cooks know what to expect.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stage === "choose" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={submitting} onClick={() => submit("succeeded", [])}>
              Worked
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => setStage("tweaks")}
            >
              Needed tweaks
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={submitting}
              onClick={() => {
                submit("skipped_feedback", [])
                onDismiss?.()
              }}
            >
              Skip
            </Button>
          </div>
        )}

        {stage === "tweaks" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Pick up to {MAX_SELECTED_TAGS}. This stays private unless you choose to share it.
            </p>
            <div className="flex flex-wrap gap-2">
              {RECIPE_FEEDBACK_TAGS.map((tag) => {
                const selected = selectedTags.includes(tag)
                return (
                  <Badge
                    key={tag}
                    variant={selected ? "default" : "outline"}
                    role="button"
                    aria-pressed={selected}
                    className="cursor-pointer select-none"
                    onClick={() => toggleTag(tag)}
                  >
                    {TAG_LABELS[tag]}
                  </Badge>
                )
              })}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={submitting || selectedTags.length === 0}
                onClick={() => submit("needed_tweaks", selectedTags)}
              >
                Submit
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => setStage("choose")}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
