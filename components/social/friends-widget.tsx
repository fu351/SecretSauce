"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users } from "lucide-react"
import type { ProfileSummary } from "@/lib/database/follow-db"

type FriendsData = {
  following: ProfileSummary[]
  followerCount: number
  followingCount: number
}

function Avatar({ profile }: { profile: ProfileSummary }) {
  const initials = profile.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  return (
    <Link
      href={profile.username ? `/user/${profile.username}` : "#"}
      title={profile.full_name ?? "Chef"}
      className="flex-shrink-0"
    >
      {profile.avatar_url ? (
        <Image
          src={profile.avatar_url}
          alt={profile.full_name ?? "Chef"}
          width={40}
          height={40}
          className="rounded-full object-cover ring-2 ring-background hover:ring-primary/40 transition-all"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-muted ring-2 ring-background hover:ring-primary/40 transition-all flex items-center justify-center text-xs font-semibold text-foreground">
          {initials}
        </div>
      )}
    </Link>
  )
}

export function FriendsWidget() {
  const [data, setData] = useState<FriendsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/social/friends-preview")
      .then((r) => r.json())
      .then((json) => {
        if (!json.error) setData(json)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center justify-between">
          Your Circle
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardTitle>
        {data && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{data.followerCount}</span> followers ·{" "}
            <span className="font-medium text-foreground">{data.followingCount}</span> following
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {loading ? (
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-10 h-10 rounded-full bg-muted animate-pulse" />
            ))}
          </div>
        ) : !data || data.following.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Follow people to see their recipes in your feed.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.following.map((p) => (
              <Avatar key={p.id} profile={p} />
            ))}
            {data.followingCount > 10 && (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground ring-2 ring-background">
                +{data.followingCount - 10}
              </div>
            )}
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href="/recipes">Find People</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
