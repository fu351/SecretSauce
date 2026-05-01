"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export function CookCheckDraftCard({
  draft,
  onPublish,
  onSkip,
  publishing,
}: {
  draft: any
  onPublish: (draft: any) => void
  onSkip: (draft: any) => void
  publishing: boolean
}) {
  const [caption, setCaption] = useState<string>(draft.caption ?? "")
  const [visibility, setVisibility] = useState<string>(draft.visibility ?? "private")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share this cook check</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">Source: {draft.source_type}</p>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Add a short caption"
        />
        <div className="flex gap-2">
          <Button size="sm" variant={visibility === "private" ? "default" : "outline"} onClick={() => setVisibility("private")}>
            Keep private
          </Button>
          <Button size="sm" variant={visibility === "followers" ? "default" : "outline"} onClick={() => setVisibility("followers")}>
            Visible to friends
          </Button>
          <Button size="sm" variant={visibility === "public" ? "default" : "outline"} onClick={() => setVisibility("public")}>
            Public
          </Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={publishing} onClick={() => onPublish({ ...draft, caption, visibility })}>
            Publish
          </Button>
          <Button size="sm" variant="outline" disabled={publishing} onClick={() => onSkip(draft)}>
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
