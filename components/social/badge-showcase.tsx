"use client"

import { useCallback, useEffect, useState } from "react"
import { Award, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BADGE_DEFINITIONS, MAX_SHOWCASED_BADGES, type BadgeId } from "@/lib/badges/badge-definitions"
import { useToast } from "@/hooks"
import { cn } from "@/lib/utils"

export interface EarnedBadge {
  id: BadgeId
  name: string
  description: string
  color: string
  emoji: string
  tier: 1 | 2 | 3
  earnedAt: string
}

interface BadgeShowcaseProps {
  username: string
  isOwnProfile: boolean
  isEditing: boolean
  onEditingChange: (isEditing: boolean) => void
}

export function BadgeShowcase({
  username,
  isOwnProfile,
  isEditing,
  onEditingChange,
}: BadgeShowcaseProps) {
  const { toast } = useToast()
  const [allBadges, setAllBadges] = useState<EarnedBadge[]>([])
  const [showcasedIds, setShowcasedIds] = useState<string[]>([])
  const [draftIds, setDraftIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isEditing) {
      setDraftIds(showcasedIds)
    }
  }, [isEditing, showcasedIds])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/users/${encodeURIComponent(username)}/badges`)
      .then((r) => r.json())
      .then(({ badges, showcasedBadgeIds }) => {
        setAllBadges(badges ?? [])
        setShowcasedIds(showcasedBadgeIds ?? [])
        setDraftIds(showcasedBadgeIds ?? [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [username])

  const showcased = showcasedIds
    .map((id) => allBadges.find((b) => b.id === id))
    .filter(Boolean) as EarnedBadge[]

  const toggleDraft = useCallback((id: string) => {
    setDraftIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_SHOWCASED_BADGES) {
        toast({ title: `Max ${MAX_SHOWCASED_BADGES} badges in showcase`, variant: "destructive" })
        return prev
      }
      return [...prev, id]
    })
  }, [toast])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/profile/badges/showcase", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showcasedBadgeIds: draftIds }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setShowcasedIds(draftIds)
      onEditingChange(false)
      toast({ title: "Badge showcase updated" })
    } catch (err: any) {
      toast({ title: "Failed to update showcase", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null
  if (allBadges.length === 0 && !isOwnProfile) return null

  if (allBadges.length === 0) {
    return (
      <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
        <Award className="h-3.5 w-3.5" />
        <span>No badges earned yet — start cooking!</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <Award className="h-3.5 w-3.5" />
          <span>Badges</span>
        </div>
        {isEditing && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEditingChange(false)}
              disabled={saving}
              className="h-6 gap-1 px-2 text-xs"
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-6 gap-1 px-2 text-xs">
              <Check className="h-3 w-3" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Select up to {MAX_SHOWCASED_BADGES} badges to feature on your profile
          </p>
          <div className="flex flex-wrap gap-2">
            {allBadges.map((badge) => {
              const selected = draftIds.includes(badge.id)
              return (
                <button
                  key={badge.id}
                  type="button"
                  onClick={() => toggleDraft(badge.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:border-border/80 hover:bg-muted/60"
                  )}
                >
                  <span>{badge.emoji}</span>
                  <span className="font-medium">{badge.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : showcased.length > 0 ? (
        <TooltipProvider delayDuration={300}>
          <div className="flex flex-wrap gap-2">
            {showcased.map((badge) => (
              <Tooltip key={badge.id}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs",
                      badge.tier === 3 && "border-amber-500/30 bg-amber-500/5",
                      badge.tier === 2 && "border-primary/20 bg-primary/5"
                    )}
                  >
                    <span>{badge.emoji}</span>
                    <span className="font-medium text-foreground">{badge.name}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {badge.description}
                </TooltipContent>
              </Tooltip>
            ))}
            {/* Show a count of remaining earned but unshowcased badges */}
            {allBadges.length > showcased.length && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
                    +{allBadges.length - showcased.length} more
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {allBadges
                    .filter((b) => !showcasedIds.includes(b.id))
                    .map((b) => b.name)
                    .join(", ")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      ) : isOwnProfile ? (
        <p className="text-xs text-muted-foreground">
          You have {allBadges.length} badge{allBadges.length !== 1 ? "s" : ""} — click Edit to showcase them
        </p>
      ) : null}
    </div>
  )
}
