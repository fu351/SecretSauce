"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChefHat, ExternalLink, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ProfileKitchenActivityItem {
  id: string
  activityType?: string | null
  title: string
  body?: string | null
  recipeTitle?: string | null
  recipeTitles?: string[]
  tags?: string[]
  occurredAt?: string | null
}

interface ProfileKitchenActivityProps {
  username: string
  isOwnProfile: boolean
  canViewContent: boolean
}

function activityLabel(activityType?: string | null) {
  if (activityType === "meal_plan_share") return "Meal plan"
  if (activityType === "cooking_journey") return "Journey"
  return "Cook check"
}

function formatActivityDate(value?: string | null) {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp))
}

export function ProfileKitchenActivity({
  username,
  isOwnProfile,
  canViewContent,
}: ProfileKitchenActivityProps) {
  const [items, setItems] = useState<ProfileKitchenActivityItem[]>([])
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(canViewContent)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canViewContent) return

    let active = true
    setLoading(true)
    setError(null)

    fetch(`/api/users/${encodeURIComponent(username)}/kitchen-activity?limit=3`, { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error ?? "Kitchen activity could not be loaded")
        return payload
      })
      .then((payload) => {
        if (!active) return
        setItems(Array.isArray(payload.items) ? payload.items : [])
        setHidden(Boolean(payload.hidden))
      })
      .catch((fetchError) => {
        if (!active) return
        setError(fetchError instanceof Error ? fetchError.message : "Kitchen activity could not be loaded")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [canViewContent, username])

  if (!canViewContent || hidden) return null

  return (
    <section aria-labelledby="profile-kitchen-activity-title">
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kitchen Sync</p>
            <CardTitle id="profile-kitchen-activity-title" className="mt-1 text-base">
              Kitchen activity
            </CardTitle>
          </div>
          {isOwnProfile ? (
            <Button size="sm" variant="outline" asChild>
              <Link href="/kitchen">
                Manage
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-2 sm:grid-cols-3" aria-label="Loading kitchen activity">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-24 rounded-lg border bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : items.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {items.map((item) => {
                const dateLabel = formatActivityDate(item.occurredAt)
                const recipeLine =
                  item.recipeTitle ??
                  (Array.isArray(item.recipeTitles) && item.recipeTitles.length > 0 ? item.recipeTitles.join(", ") : null)
                return (
                  <article key={item.id} className="min-w-0 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="rounded-md">
                        {activityLabel(item.activityType)}
                      </Badge>
                      {dateLabel ? <span className="text-xs text-muted-foreground">{dateLabel}</span> : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium">{item.title}</p>
                    {item.body ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p> : null}
                    {recipeLine ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{recipeLine}</p> : null}
                    {Array.isArray(item.tags) && item.tags.length > 0 ? (
                      <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{item.tags.join(" / ")}</p>
                    ) : null}
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <ChefHat className="h-5 w-5 shrink-0" />
                <p>
                  {isOwnProfile
                    ? "Share a cook check, meal plan, or completed journey when you want it on your profile."
                    : "No kitchen activity shared yet."}
                </p>
              </div>
              {isOwnProfile ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href="/kitchen">
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Open Kitchen
                  </Link>
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
