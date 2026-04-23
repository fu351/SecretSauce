"use client"

import { useEffect, useState, type ChangeEvent } from "react"
import Image from "next/image"
import { BadgeShowcase } from "@/components/social/badge-showcase"
import { ProfileFollowButton } from "@/components/social/profile-follow-button"
import { Camera, Check, Globe, Lock, PencilLine, Settings, X } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { supabase } from "@/lib/database/supabase"
import { normalizeUsername, validateUsername } from "@/lib/auth/username"

interface ProfileIdentityControlsProps {
  isOwnProfile: boolean
  profileId: string
  fullName: string | null
  avatarUrl: string | null
  username: string | null
  isPrivate: boolean
  fullNameHidden: boolean
  showFollowButton?: boolean
  initialFollowStatus?: "none" | "pending" | "accepted"
}

export function ProfileIdentityControls({
  isOwnProfile,
  profileId,
  fullName,
  avatarUrl,
  username,
  isPrivate,
  fullNameHidden,
  showFollowButton = false,
  initialFollowStatus = "none",
}: ProfileIdentityControlsProps) {
  const { user, updateProfile } = useAuth()
  const { toast } = useToast()

  const [displayName, setDisplayName] = useState(fullName ?? "")
  const [handle, setHandle] = useState(username ?? "")
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(avatarUrl)
  const [currentIsPrivate, setCurrentIsPrivate] = useState(isPrivate)
  const [currentFullNameHidden, setCurrentFullNameHidden] = useState(fullNameHidden)
  const [draftDisplayName, setDraftDisplayName] = useState(fullName ?? "")
  const [draftHandle, setDraftHandle] = useState(username ?? "")
  const [draftIsPrivate, setDraftIsPrivate] = useState(isPrivate)
  const [draftFullNameHidden, setDraftFullNameHidden] = useState(fullNameHidden)
  const [followerCount, setFollowerCount] = useState<number | null>(null)
  const [followingCount, setFollowingCount] = useState<number | null>(null)
  const [isBadgeEditing, setIsBadgeEditing] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    setDisplayName(fullName ?? "")
    setHandle(username ?? "")
    setCurrentAvatarUrl(avatarUrl)
    setCurrentIsPrivate(isPrivate)
    setCurrentFullNameHidden(fullNameHidden)

    if (!isEditing) {
      setDraftDisplayName(fullName ?? "")
      setDraftHandle(username ?? "")
      setDraftIsPrivate(isPrivate)
      setDraftFullNameHidden(fullNameHidden)
    }
  }, [avatarUrl, fullName, fullNameHidden, isEditing, isPrivate, username])

  useEffect(() => {
    let isMounted = true

    const loadCounts = async () => {
      try {
        const res = await fetch(`/api/social/counts?profileId=${encodeURIComponent(profileId)}`)
        const data = await res.json()

        if (!isMounted) return
        if (!res.ok) throw new Error(data?.error ?? "Failed to load profile counts")

        setFollowerCount(data.followerCount ?? 0)
        setFollowingCount(data.followingCount ?? 0)
      } catch {
        if (!isMounted) return
        setFollowerCount(0)
        setFollowingCount(0)
      }
    }

    void loadCounts()

    return () => {
      isMounted = false
    }
  }, [profileId])

  if (isOwnProfile && !user) {
    return null
  }

  const initials = (displayName || handle || "?")
    .split(" ")
    .map((name) => name[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const normalizedDraftHandle = normalizeUsername(draftHandle)
  const hasProfileChanges =
    draftDisplayName.trim() !== displayName ||
    normalizedDraftHandle !== handle ||
    draftIsPrivate !== currentIsPrivate ||
    draftFullNameHidden !== currentFullNameHidden

  const startEditing = () => {
    setIsBadgeEditing(false)
    setDraftDisplayName(displayName)
    setDraftHandle(handle)
    setDraftIsPrivate(currentIsPrivate)
    setDraftFullNameHidden(currentFullNameHidden)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setDraftDisplayName(displayName)
    setDraftHandle(handle)
    setDraftIsPrivate(currentIsPrivate)
    setDraftFullNameHidden(currentFullNameHidden)
    setIsEditing(false)
  }

  const startBadgeEditing = () => {
    setIsEditing(false)
    setIsBadgeEditing(true)
  }

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files || e.target.files.length === 0) return

    const file = e.target.files[0]

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive",
      })
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 2MB.",
        variant: "destructive",
      })
      return
    }

    setUploadingAvatar(true)
    try {
      const fileExt = file.name.split(".").pop()
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName)

      await updateProfile({ avatar_url: publicUrl })
      setCurrentAvatarUrl(publicUrl)

      toast({
        title: "Avatar updated",
        description: "Your profile picture has been updated successfully.",
      })
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload avatar. Please try again.",
        variant: "destructive",
      })
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSaveProfile = async () => {
    const nextDisplayName = draftDisplayName.trim()
    const nextHandle = normalizeUsername(draftHandle)
    const usernameError = validateUsername(nextHandle)

    if (usernameError) {
      toast({
        title: "Invalid username",
        description: usernameError,
        variant: "destructive",
      })
      return
    }

    setSavingProfile(true)
    try {
      await updateProfile({
        full_name: nextDisplayName,
        username: nextHandle,
        is_private: draftIsPrivate,
        full_name_hidden: draftFullNameHidden,
      })
      setDisplayName(nextDisplayName)
      setHandle(nextHandle)
      setCurrentIsPrivate(draftIsPrivate)
      setCurrentFullNameHidden(draftFullNameHidden)
      setIsEditing(false)
      toast({
        title: "Profile updated",
        description: "Your changes have been saved.",
      })
    } catch (error) {
      toast({
        title: "Could not update profile",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setSavingProfile(false)
    }
  }

  return (
    <Card className="overflow-hidden border-border/60 bg-card/90 shadow-sm backdrop-blur">
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-full bg-muted sm:h-24 sm:w-24">
                {currentAvatarUrl ? (
                  <Image
                    src={currentAvatarUrl}
                    alt={displayName || "Profile"}
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-foreground">
                    {initials}
                  </div>
                )}
              </div>

              {isEditing ? (
                <label className="absolute bottom-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
                  <Camera className="h-4 w-4" />
                  <input
                    type="file"
                    aria-label="Upload avatar"
                    title="Upload avatar"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                    className="hidden"
                  />
                </label>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              {!isEditing ? (
                <>
                  <div className="flex min-w-0 flex-col gap-2 sm:min-h-[5rem] sm:justify-center">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h1 className="truncate text-2xl font-semibold text-foreground">
                        {handle ? `@${handle}` : "No username set"}
                      </h1>
                      {!currentFullNameHidden ? (
                        <p className="truncate text-sm text-muted-foreground">
                          {displayName || "Anonymous Chef"}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex max-w-sm flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-background/80 px-4 py-2.5 text-sm shadow-sm">
                    <div className="min-w-0 font-medium text-foreground">
                      {followerCount ?? "-"} <span className="text-muted-foreground">Followers</span>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="min-w-0 font-medium text-foreground">
                      {followingCount ?? "-"} <span className="text-muted-foreground">Following</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="profile-username">Username</Label>
                    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 shadow-sm">
                      <span className="text-sm font-medium text-muted-foreground">@</span>
                      <Input
                        id="profile-username"
                        aria-label="Username"
                        value={draftHandle}
                        onChange={(e) => setDraftHandle(e.target.value)}
                        placeholder="your-handle"
                        className="h-auto border-0 bg-transparent p-0 text-base font-semibold text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="profile-full-name">Full name</Label>
                    <Input
                      id="profile-full-name"
                      aria-label="Full name"
                      value={draftDisplayName}
                      onChange={(e) => setDraftDisplayName(e.target.value)}
                      placeholder="Enter your name"
                    />
                  </div>

                  <div className="rounded-xl border border-border/60 bg-background p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="profile-full-name-hidden" className="text-sm font-medium">
                          Hide full name
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Show only your username on the public profile.
                        </p>
                      </div>
                      <Switch
                        id="profile-full-name-hidden"
                        checked={draftFullNameHidden}
                        onCheckedChange={setDraftFullNameHidden}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-background p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="profile-privacy" className="text-sm font-medium">
                          Public profile
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {draftIsPrivate
                            ? "Only accepted followers can view your content."
                            : "Anyone can view your profile content."}
                        </p>
                      </div>
                      <Switch
                        id="profile-privacy"
                        aria-label="Public profile"
                        checked={!draftIsPrivate}
                        onCheckedChange={(checked) => setDraftIsPrivate(!checked)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditing}
                  disabled={savingProfile}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveProfile}
                  disabled={!hasProfileChanges || savingProfile}
                  className="gap-2"
                >
                  <Check className="h-4 w-4" />
                  {savingProfile ? "Saving..." : "Save changes"}
                </Button>
              </>
            ) : (
              <>
                {isOwnProfile ? (
                  <>
                    <Button type="button" size="sm" className="gap-2" onClick={startEditing}>
                      <PencilLine className="h-4 w-4" />
                      Edit profile
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={startBadgeEditing}
                    >
                      <Settings className="h-4 w-4" />
                      Manage badges
                    </Button>
                  </>
                ) : null}

                {showFollowButton && !isOwnProfile ? (
                  <ProfileFollowButton
                    targetProfileId={profileId}
                    initialStatus={initialFollowStatus}
                    isPrivate={isPrivate}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="space-y-3 border-t border-border/60 pt-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {currentIsPrivate ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
            <span>{currentIsPrivate ? "Follower-only content" : "Public profile"}</span>
          </div>

          {username ? (
            <BadgeShowcase
              username={username}
              isOwnProfile={isOwnProfile}
              isEditing={isBadgeEditing}
              onEditingChange={setIsBadgeEditing}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
