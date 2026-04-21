"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Globe, Lock, Loader2, Settings2 } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

interface ProfilePrivacyControlsProps {
  isOwnProfile: boolean
  isPrivate: boolean
}

export function ProfilePrivacyControls({ isOwnProfile, isPrivate }: ProfilePrivacyControlsProps) {
  const { user, updateProfile } = useAuth()
  const { toast } = useToast()
  const [currentIsPrivate, setCurrentIsPrivate] = useState(isPrivate)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCurrentIsPrivate(isPrivate)
  }, [isPrivate])

  if (!isOwnProfile || !user) {
    return null
  }

  const handleToggle = async (checked: boolean) => {
    const previousValue = currentIsPrivate
    setCurrentIsPrivate(checked)
    setSaving(true)

    try {
      await updateProfile({ is_private: checked })
      toast({
        title: checked ? "Profile set to private" : "Profile set to public",
        description: checked
          ? "Only approved followers can see your recipes and profile details."
          : "Anyone can view your public profile again.",
      })
    } catch (error) {
      setCurrentIsPrivate(previousValue)
      toast({
        title: "Could not update privacy",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-8 border-border bg-card/80 backdrop-blur">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg">Profile controls</CardTitle>
        <CardDescription>
          Manage how your profile appears to other people.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/40 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              {currentIsPrivate ? (
                <>
                  <Lock className="h-4 w-4" />
                  Private profile
                </>
              ) : (
                <>
                  <Globe className="h-4 w-4" />
                  Public profile
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {currentIsPrivate
                ? "New followers need approval before they can see your recipes."
                : "Your recipes and profile are visible to anyone who visits."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              checked={currentIsPrivate}
              onCheckedChange={handleToggle}
              disabled={saving}
              aria-label="Toggle profile privacy"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Need to edit your name, avatar, or other profile details?
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">
              <Settings2 className="h-4 w-4" />
              Open settings
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
