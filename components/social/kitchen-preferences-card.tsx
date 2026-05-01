"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function KitchenPreferencesCard({
  preferences,
  onUpdate,
  updating,
}: {
  preferences: any
  onUpdate: (patch: Record<string, unknown>) => void
  updating: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kitchen Sync preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">Private by default. Share only what you approve.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={preferences?.socialVisibilityDefault === "private" ? "default" : "outline"} onClick={() => onUpdate({ socialVisibilityDefault: "private" })} disabled={updating}>
            Keep private
          </Button>
          <Button size="sm" variant={preferences?.socialVisibilityDefault === "followers" ? "default" : "outline"} onClick={() => onUpdate({ socialVisibilityDefault: "followers" })} disabled={updating}>
            Visible to friends
          </Button>
          <Button size="sm" variant={preferences?.socialVisibilityDefault === "public" ? "default" : "outline"} onClick={() => onUpdate({ socialVisibilityDefault: "public" })} disabled={updating}>
            Public
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate({ showReactionCounts: !preferences?.showReactionCounts })}
          disabled={updating}
        >
          {preferences?.showReactionCounts ? "Hide reaction counts" : "Show reaction counts"}
        </Button>
      </CardContent>
    </Card>
  )
}
