"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const REACTION_KEYS = ["fire", "yum", "clap", "chefkiss"] as const

export function KitchenSyncFeed({
  feed,
  onToggleReaction,
  onRemixMealPlan,
  reacting,
  remixing,
}: {
  feed: any[]
  onToggleReaction: (input: { cookCheckId: string; reactionKey: string; active: boolean }) => void
  onRemixMealPlan: (shareId: string) => void
  reacting: boolean
  remixing: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kitchen Sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shared kitchen activity yet.</p>
        ) : null}
        {feed.map((item) => {
          const activityType = item.payload?.activityType
          const cookCheckId = item.payload?.cookCheckId
          const shareId = item.payload?.shareId

          return (
            <div key={item.id} className="rounded border p-3 text-sm">
              {activityType === "meal_plan_share" ? (
                <>
                  <p className="font-medium">{item.payload?.title || "Meal plan shared"}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.payload?.summaryLine}
                    {Array.isArray(item.payload?.tags) && item.payload.tags.length > 0 ? ` · ${item.payload.tags.join(" · ")}` : ""}
                  </p>
                  {Array.isArray(item.payload?.recipeTitles) && item.payload.recipeTitles.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">{item.payload.recipeTitles.join(", ")}</p>
                  ) : null}
                  {shareId ? (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      disabled={remixing}
                      onClick={() => onRemixMealPlan(shareId)}
                    >
                      Remix this plan
                    </Button>
                  ) : null}
                </>
              ) : activityType === "cooking_journey" ? (
                <>
                  <p className="font-medium">{item.payload?.title || "Cooking journey completed"}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.payload?.achievementLabel || "Journey completed"} · {item.payload?.progressLabel}
                  </p>
                </>
              ) : (
                <p className="font-medium">{item.payload?.caption || "Cook check posted"}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{item.visibility} · {new Date(item.occurred_at).toLocaleString()}</p>

              {cookCheckId ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {REACTION_KEYS.map((reactionKey) => {
                    const mine = (item.reactions?.mine ?? []).includes(reactionKey)
                    const count = item.reactions?.counts?.[reactionKey] ?? 0
                    return (
                      <Button
                        key={reactionKey}
                        size="sm"
                        variant={mine ? "default" : "outline"}
                        disabled={reacting}
                        onClick={() => onToggleReaction({ cookCheckId, reactionKey, active: mine })}
                      >
                        {reactionKey} {count > 0 ? count : ""}
                      </Button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
