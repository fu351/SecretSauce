"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const REACTION_KEYS = ["fire", "yum", "clap", "chefkiss"] as const

export function KitchenSyncFeed({
  feed,
  onToggleReaction,
  reacting,
}: {
  feed: any[]
  onToggleReaction: (input: { cookCheckId: string; reactionKey: string; active: boolean }) => void
  reacting: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kitchen Sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published cook checks yet.</p>
        ) : null}
        {feed.map((item) => {
          const cookCheckId = item.payload?.cookCheckId
          return (
            <div key={item.id} className="rounded border p-3 text-sm">
              <p className="font-medium">{item.payload?.caption || "Cook check posted"}</p>
              <p className="text-xs text-muted-foreground">{item.visibility} • {new Date(item.occurred_at).toLocaleString()}</p>
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
