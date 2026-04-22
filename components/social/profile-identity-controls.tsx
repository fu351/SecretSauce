"use client"

import { useEffect, useState, type ChangeEvent } from "react"
import Image from "next/image"
import { BadgeShowcase } from "@/components/social/badge-showcase"
import { ProfileFollowButton } from "@/components/social/profile-follow-button"
import { Camera, Check, ChevronDown, Globe, Lock, Settings, X } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to load profile counts")
        }

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

  const initials = (displayName || "?")
    .split(" ")
    .map((n) => n[0])
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

  const privacyBadge = (
    <Badge
      variant={currentIsPrivate ? "secondary" : "outline"}
      aria-label={currentIsPrivate ? "Private profile" : "Public profile"}
      className="gap-1.5 px-2.5 py-1"
    >
      {currentIsPrivate ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
      {currentIsPrivate ? "Private" : "Public"}
    </Badge>
  )

  return (
    <Card className="overflow-hidden border-border/60 bg-card/90 shadow-sm backdrop-blur">
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <div className="h-16 w-16 overflow-hidden rounded-full bg-muted sm:h-[4.5rem] sm:w-[4.5rem]">
              {currentAvatarUrl ? (
                <Image
                  src={currentAvatarUrl}
                  alt={displayName || "Profile"}
                  width={72}
                  height={72}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-foreground">
                  {initials}
                </div>
              )}
            </div>

            {isEditing && (
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
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                {!isEditing ? (
                  <div className="space-y-1">
                    <h1 className="truncate text-xl font-semibold text-foreground">
                      {handle ? `@${handle}` : "No username set"}
                    </h1>
                    {!currentFullNameHidden ? (
                      <p className="text-xs text-muted-foreground">
                        {displayName || "Anonymous Chef"}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="profile-username" className="sr-only">
                        Username
                      </Label>
                      <div className="flex items-center gap-2 rounded-xl border-2 border-primary/20 bg-background px-3 py-2 shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                        <span className="text-sm font-medium text-muted-foreground">@</span>
                        <Input
                          id="profile-username"
                          value={draftHandle}
                          onChange={(e) => setDraftHandle(e.target.value)}
                          placeholder="your-handle"
                          className="h-auto border-0 bg-transparent p-0 text-2xl font-semibold text-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="profile-full-name" className="sr-only">
                        Full Name
                      </Label>
                      <Input
                        id="profile-full-name"
                        value={draftDisplayName}
                        onChange={(e) => setDraftDisplayName(e.target.value)}
                        placeholder="Enter your name"
                        className="h-auto rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20"
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-background px-3 py-2 shadow-sm">
                      <Label htmlFor="profile-full-name-hidden" className="text-sm font-medium text-foreground">
                        Hide full name
                      </Label>
                      <Switch
                        id="profile-full-name-hidden"
                        checked={draftFullNameHidden}
                        onCheckedChange={setDraftFullNameHidden}
                      />
                    </div>

                    <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-background px-3 py-2 shadow-sm">
                      <Switch
                        id="profile-privacy"
                        checked={draftIsPrivate}
                        onCheckedChange={setDraftIsPrivate}
                      />
                      <Label htmlFor="profile-privacy" className="text-sm font-medium text-foreground">
                        {draftIsPrivate ? "Private profile" : "Public profile"}
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                    {privacyBadge}
                    {isOwnProfile && !isEditing && !isBadgeEditing && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="gap-2">
                            <Settings className="h-4 w-4" />
                            Edit
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={startEditing}>
                            Edit profile
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={startBadgeEditing}>
                            Manage badges
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                )}
              </div>

              {!isEditing ? (
                <div className="flex w-full max-w-[18rem] items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-3 shadow-sm backdrop-blur sm:ml-auto sm:w-auto sm:min-w-[16rem]">
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold leading-none text-foreground">
                      {followerCount ?? "—"}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Followers
                    </p>
                  </div>
                  <div className="h-10 w-px bg-border" />
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold leading-none text-foreground">
                      {followingCount ?? "—"}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Following
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
              <div className="min-w-0">
                {username && (
                  <BadgeShowcase
                    username={username}
                    isOwnProfile={isOwnProfile}
                    isEditing={isBadgeEditing}
                    onEditingChange={setIsBadgeEditing}
                  />
                )}
              </div>

              {showFollowButton && !isOwnProfile ? (
                <div className="flex justify-end">
                  <ProfileFollowButton
                    targetProfileId={profileId}
                    initialStatus={initialFollowStatus}
                    isPrivate={isPrivate}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
