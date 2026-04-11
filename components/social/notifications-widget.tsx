"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bell, Check, Heart, Repeat2, UserPlus, X } from "lucide-react"

type ProfileSnippet = {
  id: string
  full_name: string | null
  avatar_url: string | null
  username: string | null
}

type Notification =
  | { type: "follow_request"; requestId: string; from: ProfileSnippet; created_at: string }
  | { type: "new_follower";   from: ProfileSnippet; created_at: string }
  | { type: "post_like";      from: ProfileSnippet; post: { id: string; title: string }; created_at: string }
  | { type: "post_repost";    from: ProfileSnippet; post: { id: string; title: string }; created_at: string }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function ProfileAvatar({ profile }: { profile: ProfileSnippet }) {
  const initials = profile.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"
  return profile.avatar_url ? (
    <Image
      src={profile.avatar_url}
      alt={profile.full_name ?? "Chef"}
      width={32}
      height={32}
      className="rounded-full object-cover flex-shrink-0"
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground flex-shrink-0">
      {initials}
    </div>
  )
}

function NotificationIcon({ type }: { type: Notification["type"] }) {
  const base = "h-3.5 w-3.5"
  if (type === "follow_request") return <UserPlus className={`${base} text-blue-500`} />
  if (type === "new_follower")   return <UserPlus className={`${base} text-green-500`} />
  if (type === "post_like")      return <Heart    className={`${base} text-red-500`} />
  return                                <Repeat2  className={`${base} text-emerald-500`} />
}

export function NotificationsWidget() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading]             = useState(true)
  const [responding, setResponding]       = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/social/notifications")
      .then((r) => r.json())
      .then((json) => { if (!json.error) setNotifications(json.notifications ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const respond = async (requestId: string, action: "accept" | "reject") => {
    setResponding(requestId)
    try {
      const res = await fetch("/api/social/follow/respond", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      })
      if (res.ok) {
        setNotifications((prev) =>
          action === "accept"
            ? prev.map((n) =>
                n.type === "follow_request" && n.requestId === requestId
                  ? { type: "new_follower" as const, from: n.from, created_at: new Date().toISOString() }
                  : n
              )
            : prev.filter((n) => !(n.type === "follow_request" && n.requestId === requestId))
        )
      }
    } finally {
      setResponding(null)
    }
  }

  const displayName = (p: ProfileSnippet) => p.full_name ?? p.username ?? "Someone"

  const profileHref = (p: ProfileSnippet) =>
    p.username ? `/user/${p.username}` : "#"

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center justify-between">
          Notifications
          <Bell className="h-4 w-4 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 h-3 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing new — check back soon.</p>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n, i) => (
              <li key={i} className="flex items-start gap-3">
                <Link href={profileHref(n.from)} className="flex-shrink-0 relative">
                  <ProfileAvatar profile={n.from} />
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-px">
                    <NotificationIcon type={n.type} />
                  </span>
                </Link>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">
                    <Link href={profileHref(n.from)} className="font-medium hover:underline">
                      {displayName(n.from)}
                    </Link>{" "}
                    {n.type === "follow_request" && "wants to follow you"}
                    {n.type === "new_follower"   && "started following you"}
                    {n.type === "post_like"      && <>liked your post <span className="italic">"{n.post.title}"</span></>}
                    {n.type === "post_repost"    && <>reposted <span className="italic">"{n.post.title}"</span></>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)} ago</p>

                  {n.type === "follow_request" && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        className="h-7 px-3 gap-1"
                        disabled={responding === n.requestId}
                        onClick={() => respond(n.requestId, "accept")}
                      >
                        <Check className="h-3 w-3" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 gap-1"
                        disabled={responding === n.requestId}
                        onClick={() => respond(n.requestId, "reject")}
                      >
                        <X className="h-3 w-3" /> Decline
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
