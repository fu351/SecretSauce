"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  targetProfileId: string
  initialStatus: "none" | "pending" | "accepted"
  isPrivate: boolean
}

export function ProfileFollowButton({ targetProfileId, initialStatus, isPrivate }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [loading, setLoading] = useState(false)

  const handleFollow = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/social/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followingId: targetProfileId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setStatus(json.request.status)
    } catch (e) {
      console.error("Follow error:", e)
    } finally {
      setLoading(false)
    }
  }

  const handleUnfollow = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/social/follow", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followingId: targetProfileId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      setStatus("none")
    } catch (e) {
      console.error("Unfollow error:", e)
    } finally {
      setLoading(false)
    }
  }

  if (status === "accepted") {
    return (
      <Button variant="outline" onClick={handleUnfollow} disabled={loading}>
        {loading ? "..." : "Following"}
      </Button>
    )
  }

  if (status === "pending") {
    return (
      <Button variant="outline" onClick={handleUnfollow} disabled={loading}>
        {loading ? "..." : "Requested"}
      </Button>
    )
  }

  return (
    <Button onClick={handleFollow} disabled={loading}>
      {loading ? "..." : isPrivate ? "Request to Follow" : "Follow"}
    </Button>
  )
}
