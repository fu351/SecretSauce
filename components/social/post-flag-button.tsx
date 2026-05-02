"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { Flag } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

const FLAG_REASONS = [
  { key: "spam", label: "Spam or abuse" },
  { key: "harassment", label: "Harassment" },
  { key: "misleading", label: "Misleading content" },
  { key: "other", label: "Other" },
] as const

type PostFlagButtonProps = {
  postId: string
  postTitle?: string
}

export function PostFlagButton({ postId, postTitle }: PostFlagButtonProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<(typeof FLAG_REASONS)[number]["key"]>("spam")
  const [details, setDetails] = useState("")
  const [submitting, setSubmitting] = useState(false)

  if (!user) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/auth/signin">Sign in to flag</Link>
      </Button>
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch(`/api/posts/${postId}/flags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          reason: FLAG_REASONS.find((entry) => entry.key === reason)?.label ?? reason,
          details,
          severity: reason === "harassment" ? "high" : "medium",
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to submit flag")
      }

      toast({
        title: "Flag submitted",
        description: "Thanks. The post has been sent to moderation.",
      })
      setOpen(false)
      setDetails("")
      setReason("spam")
    } catch (error: any) {
      toast({
        title: "Could not submit flag",
        description: error?.message || "Try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Flag className="h-4 w-4" />
          Flag
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Flag post</DialogTitle>
          <DialogDescription>
            Let the moderation team know if there is a problem with {postTitle ? `"${postTitle}"` : "this post"}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Reason</p>
            <div className="grid grid-cols-2 gap-2">
              {FLAG_REASONS.map((entry) => {
                const active = reason === entry.key
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setReason(entry.key)}
                    className={[
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted",
                    ].join(" ")}
                  >
                    {entry.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Details</p>
            <Textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Add any context that will help moderation review the post."
              className="min-h-28"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit flag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
