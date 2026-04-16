"use client"

import { useEffect, useState, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"
import { Users } from "lucide-react"
import type { ProfileSummary } from "@/lib/database/follow-db"

type SearchedUser = {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
}

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
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch("/api/social/friends-preview")
      .then((r) => r.json())
      .then((json) => {
        if (!json.error) setData(json)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setSearchResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}&type=user`)
        if (res.ok) {
          const json = await res.json()
          setSearchResults(json.users ?? [])
        }
      } catch {
        // ignore
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }

  const handleFollow = async (userId: string) => {
    try {
      const res = await fetch("/api/social/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followingId: userId }),
      })
      if (res.ok) {
        setFollowingIds((prev) => new Set([...prev, userId]))
      }
    } catch {
      // ignore
    }
  }

  const clearSearch = () => {
    setSearchQuery("")
    setSearchResults([])
  }

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
          <p className="text-sm text-muted-foreground">
            Follow people to see their recipes in your feed.
          </p>
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

        {/* People search */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Find people…"
              className="pl-8 pr-8 h-8 text-sm rounded-full"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                aria-label="Clear"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {searchLoading && (
            <p className="text-xs text-muted-foreground text-center py-1">Searching…</p>
          )}

          {!searchLoading && searchResults.length > 0 && (
            <div className="rounded-xl border divide-y overflow-hidden">
              {searchResults.map((u) => {
                const name = u.full_name ?? u.username ?? "Chef"
                const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                const followed = followingIds.has(u.id)
                return (
                  <div key={u.id} className="flex items-center gap-2.5 px-3 py-2">
                    <Link href={`/user/${u.username ?? u.id}`} className="flex-shrink-0">
                      {u.avatar_url ? (
                        <Image src={u.avatar_url} alt={name} width={32} height={32} className="rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground">
                          {initials}
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{name}</p>
                      {u.username && (
                        <p className="text-xs text-muted-foreground">@{u.username}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={followed ? "secondary" : "default"}
                      className="flex-shrink-0 h-7 text-xs px-3"
                      disabled={followed}
                      onClick={() => handleFollow(u.id)}
                    >
                      {followed ? "Requested" : "Follow"}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-1">No people found.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
