"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Clock, Trophy, Users } from "lucide-react"
import type { Challenge, ChallengeEntry } from "@/lib/database/challenge-db"

type ActiveChallengeData = {
  challenge: Challenge & { participant_count: number }
  entry: ChallengeEntry | null
  rank: number | null
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return "ended"
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h left`
  return `${Math.floor(hours / 24)}d left`
}

export function ChallengeWidget() {
  const [data, setData] = useState<ActiveChallengeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/challenges/active")
      .then((r) => r.json())
      .then((json) => {
        if (json.challenge) {
          setData({ challenge: json.challenge, entry: json.entry ?? null, rank: json.rank ?? null })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Card className="mb-6"><CardContent className="h-20 animate-pulse bg-muted/30 rounded-lg" /></Card>
  }

  if (!data) return null

  const { challenge, entry, rank } = data
  const hasSubmitted = !!entry?.post_id

  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardContent className="p-4 flex items-center gap-4">
        {/* Trophy icon */}
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
          <Trophy className="h-5 w-5 text-primary" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{challenge.title}</span>
            <Badge className="bg-primary/15 text-primary border-primary/20 text-xs">
              +{challenge.points} pts
            </Badge>
            {hasSubmitted && (
              <Badge variant="secondary" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" /> Entered
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeUntil(challenge.ends_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {challenge.participant_count} joined
            </span>
            {rank != null && (
              <span className="inline-flex items-center gap-1">
                <Trophy className="h-3 w-3" /> #{rank} among friends
              </span>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="flex-shrink-0">
          {hasSubmitted ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/">View</Link>
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link href="/">Enter</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
