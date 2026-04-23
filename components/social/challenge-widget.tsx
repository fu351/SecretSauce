"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Clock, Star, Users, Vote } from "lucide-react"
import type { Challenge, ChallengeEntry, ChallengeVote } from "@/lib/database/challenge-db"

type ChallengeWithCount = Challenge & { participant_count: number }

type ActiveData = {
  starChallenge:       ChallengeWithCount | null
  communityChallenges: ChallengeWithCount[]
  starEntry:           ChallengeEntry | null
  communityEntries:    Record<string, { entry: ChallengeEntry | null; vote: ChallengeVote | null }>
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return "ended"
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h left`
  return `${Math.floor(hours / 24)}d left`
}

function StarChallengeCard({ challenge, entry }: { challenge: ChallengeWithCount; entry: ChallengeEntry | null }) {
  const hasSubmitted = !!entry?.post_id

  return (
    <Card className="mb-3 border-amber-300/60 bg-gradient-to-r from-amber-50/80 to-amber-100/40 dark:from-amber-950/30 dark:to-amber-900/10">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="flex-shrink-0 h-11 w-11 rounded-full bg-amber-400/20 flex items-center justify-center">
          <Star className="h-5 w-5 text-amber-500 fill-amber-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400 shrink-0">Staff Pick</span>
            <span className="text-sm font-semibold text-foreground truncate">{challenge.title}</span>
            {hasSubmitted && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <CheckCircle2 className="h-3 w-3 text-green-500" /> Entered
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeUntil(challenge.ends_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {challenge.participant_count} joined
            </span>
            <span className="text-amber-600 dark:text-amber-500">🏅 Challenger · 🏆 Winner badge</span>
          </div>
        </div>

        <div className="flex-shrink-0">
          <Button
            size="sm"
            className={hasSubmitted ? "" : "bg-amber-500 hover:bg-amber-600 text-white border-0"}
            variant={hasSubmitted ? "outline" : "default"}
            asChild
          >
            <Link href="/challenges/join">{hasSubmitted ? "View" : "Enter"}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CommunityChallengeCard({
  challenge,
  entry,
  vote,
}: {
  challenge: ChallengeWithCount
  entry: ChallengeEntry | null
  vote: ChallengeVote | null
}) {
  const hasSubmitted = !!entry?.post_id

  return (
    <Card className="mb-2 border-primary/20 bg-primary/5">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
          <Vote className="h-4 w-4 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">Community</span>
            <span className="text-sm font-medium text-foreground truncate">{challenge.title}</span>
            {hasSubmitted && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <CheckCircle2 className="h-3 w-3 text-green-500" /> Entered
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeUntil(challenge.ends_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {challenge.participant_count} joined
            </span>
            {vote
              ? <span className="text-primary/70">🗳️ Voted</span>
              : <span>🏅 Challenger badge</span>
            }
          </div>
        </div>

        <div className="flex-shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/challenges/join">{hasSubmitted ? "View" : "Enter"}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ChallengeWidget() {
  const [data, setData] = useState<ActiveData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/challenges/active")
      .then((r) => r.json())
      .then((json) => {
        setData({
          starChallenge:       json.starChallenge ?? null,
          communityChallenges: json.communityChallenges ?? [],
          starEntry:           json.starEntry ?? null,
          communityEntries:    json.communityEntries ?? {},
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Card className="mb-6"><CardContent className="h-20 animate-pulse bg-muted/30 rounded-lg" /></Card>
  }

  const hasAnything = data?.starChallenge || (data?.communityChallenges ?? []).length > 0
  if (!hasAnything) return null

  return (
    <div className="mb-6">
      {data?.starChallenge && (
        <StarChallengeCard challenge={data.starChallenge} entry={data.starEntry} />
      )}
      {(data?.communityChallenges ?? []).map((c) => (
        <CommunityChallengeCard
          key={c.id}
          challenge={c}
          entry={data?.communityEntries[c.id]?.entry ?? null}
          vote={data?.communityEntries[c.id]?.vote ?? null}
        />
      ))}
    </div>
  )
}
