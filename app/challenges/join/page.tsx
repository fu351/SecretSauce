"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Clock, Crown, Sparkles, Trophy, Users } from "lucide-react"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks"
import type { Challenge } from "@/lib/database/challenge-db"

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return "ended"
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h left`
  return `${Math.floor(hours / 24)}d left`
}

export default function JoinChallengePage() {
  const { toast } = useToast()
  const [postDishOpen, setPostDishOpen] = useState(false)
  const [postDishTitle, setPostDishTitle] = useState("")
  const [postDishCaption, setPostDishCaption] = useState("")

  const [loading, setLoading] = useState(true)
  const [challenge, setChallenge] = useState<(Challenge & { participant_count: number }) | null>(null)
  const [rank, setRank] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/challenges/active")
        if (!res.ok) throw new Error("Failed to load challenge")
        const json = await res.json()
        if (cancelled) return
        setChallenge(json.challenge ?? null)
        setRank(typeof json.rank === "number" ? json.rank : null)
      } catch (e) {
        console.error(e)
        if (!cancelled) setChallenge(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const title = challenge?.title ?? "Weekly challenge"
  const description =
    challenge?.description?.trim() ||
    "Join the current challenge from the home page to post your dish and climb the leaderboard."

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Weekly Challenge</p>
            <h1 className="text-2xl md:text-3xl font-serif font-light text-foreground">{title}</h1>
          </div>
          {challenge ? (
            <Badge className="bg-primary/15 text-primary border border-primary/20">+{challenge.points} pts</Badge>
          ) : (
            !loading && (
              <Badge variant="secondary" className="text-muted-foreground">
                No active challenge
              </Badge>
            )
          )}
        </div>

        <Card className="overflow-hidden">
          <div className="relative w-full aspect-[16/9] bg-muted">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-muted to-background" />
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-sm text-muted-foreground max-w-md">
                {loading ? "Loading challenge…" : challenge ? "Challenge details below." : "Check back when a new challenge is live."}
              </p>
            </div>
            <div className="absolute left-4 bottom-4 right-4 flex flex-wrap items-center gap-2 text-white">
              {challenge && (
                <>
                  <Badge className="bg-black/40 text-white border-white/20">
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    {timeUntil(challenge.ends_at)}
                  </Badge>
                  <Badge className="bg-black/40 text-white border-white/20">
                    <Users className="h-3.5 w-3.5 mr-1" />
                    {challenge.participant_count} joined
                  </Badge>
                  {rank != null && (
                    <Badge className="bg-black/40 text-white border-white/20">
                      <Trophy className="h-3.5 w-3.5 mr-1" />#{rank} among friends
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>

          <CardContent className="p-4 md:p-6 space-y-5">
            <div className="space-y-2">
              <h2 className="text-lg md:text-xl font-semibold text-foreground">Overview</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{description}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    How it works
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  Cook something that fits the theme, post it from the home page, and your entry is linked to this
                  challenge when you submit.
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-primary" />
                    Points
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {challenge
                    ? `This challenge awards +${challenge.points} points toward your weekly standing.`
                    : "Points are shown when a challenge is active."}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Crown className="h-4 w-4 text-primary" />
                    Leaderboard
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  See friends and global ranks on your home feed after you join.
                </CardContent>
              </Card>
            </div>

            <Separator />

            <div className="flex flex-col md:flex-row gap-2">
              {challenge ? (
                <Button className="flex-1" asChild>
                  <Link href="/home">Go to home to enter</Link>
                </Button>
              ) : (
                <Button className="flex-1" type="button" disabled>
                  {loading ? "Loading…" : "No challenge to join"}
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={() => setPostDishOpen(true)} disabled={!challenge}>
                Post your dish (from home)
              </Button>
              <Button variant="ghost" className="flex-1" asChild>
                <Link href="/home">Back to Home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={postDishOpen} onOpenChange={setPostDishOpen}>
        <DialogContent className="w-[96vw] max-w-md max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] border-b text-left">
            <DialogTitle className="text-base">Post your dish</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Use the home page to upload a photo and submit — it connects to challenges and your feed.
            </p>
          </DialogHeader>
          <div className="p-4 space-y-4 overflow-y-auto overscroll-contain">
            <div className="space-y-2">
              <Label>Photo</Label>
              <div className="relative w-full aspect-[4/3] rounded-xl border bg-muted overflow-hidden">
                <Image
                  src="/placeholder.svg?height=600&width=800&text=Upload+Photo"
                  alt="Upload placeholder"
                  fill
                  className="object-cover opacity-80"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button variant="secondary" size="sm" asChild>
                    <Link href="/home">Open home to post</Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="post-title">Dish name</Label>
              <Input
                id="post-title"
                value={postDishTitle}
                onChange={(e) => setPostDishTitle(e.target.value)}
                placeholder="e.g. Pantry pasta"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="post-caption">Caption</Label>
              <Textarea
                id="post-caption"
                value={postDishCaption}
                onChange={(e) => setPostDishCaption(e.target.value)}
                placeholder="What did you use up from the pantry?"
                rows={3}
              />
            </div>

            {challenge && (
              <div className="rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Challenge</span>
                  <Badge variant="secondary">{challenge.title}</Badge>
                </div>
              </div>
            )}
          </div>

          <div className="border-t bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setPostDishTitle("")
                  setPostDishCaption("")
                }}
              >
                Clear
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setPostDishOpen(false)
                  toast({
                    title: "Post from home",
                    description: "Open Home and use “Post your dish” to submit with a photo.",
                  })
                }}
              >
                Got it
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
