"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Settings, ExternalLink } from "lucide-react"
import type { Profile } from "@/lib/database/profile-db"

interface Props {
  profile: Profile
}

export function ProfileCard({ profile }: Props) {
  const [followerCount, setFollowerCount] = useState<number | null>(null)
  const [followingCount, setFollowingCount] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/social/counts?profileId=${profile.id}`)
      .then((r) => r.json())
      .then((data) => {
        setFollowerCount(data.followerCount ?? 0)
        setFollowingCount(data.followingCount ?? 0)
      })
      .catch(() => {
        setFollowerCount(0)
        setFollowingCount(0)
      })
  }, [profile.id])

  const initials = profile.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"
  const displayName = profile.full_name_hidden ? profile.username : profile.full_name

  return (
    <Card className="border-border bg-card mb-6">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.full_name ?? "Profile"}
              width={64}
              height={64}
              className="rounded-full object-cover ring-2 ring-border flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-muted ring-2 ring-border flex items-center justify-center text-xl font-semibold text-foreground flex-shrink-0">
              {initials}
            </div>
          )}

          {/* Name + username + counts */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">
              {profile.username ? `@${profile.username}` : "No username set"}
            </p>
            {displayName && (
              <p className="text-sm text-muted-foreground">
                {displayName}
              </p>
            )}
            <div className="flex gap-4 mt-2">
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {followerCount ?? "—"}
                </span>{" "}
                followers
              </span>
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {followingCount ?? "—"}
                </span>{" "}
                following
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {profile.username && (
              <Link href={`/user/${profile.username}`}>
                <Button variant="outline" size="sm" className="w-full gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Profile
                </Button>
              </Link>
            )}
            <Link href="/settings">
              <Button variant="outline" size="sm" className="w-full gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
