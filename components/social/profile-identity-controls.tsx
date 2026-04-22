"use client"

import { useEffect, useState, type ChangeEvent } from "react"
import Image from "next/image"
import { Camera, Check, Globe, Lock, Settings2, X } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { supabase } from "@/lib/database/supabase"
import { normalizeUsername, validateUsername } from "@/lib/auth/username"

interface ProfileIdentityControlsProps {
  isOwnProfile: boolean
  fullName: string | null
  avatarUrl: string | null
  username: string | null
  isPrivate: boolean
  fullNameHidden: boolean
}

export function ProfileIdentityControls({
  isOwnProfile,
  fullName,
  avatarUrl,
  username,
  isPrivate,
  fullNameHidden,
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
    <Card className="mb-8 overflow-hidden border-border/60 bg-card/90 shadow-sm backdrop-blur">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <div className="h-[4.5rem] w-[4.5rem] overflow-hidden rounded-full bg-muted sm:h-20 sm:w-20">
              {currentAvatarUrl ? (
                <Image
                  src={currentAvatarUrl}
                  alt={displayName || "Profile"}
                  width={80}
                  height={80}
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                {!isEditing ? (
                  <>
                    <h1 className="truncate text-2xl font-semibold text-foreground">
                      {handle ? `@${handle}` : "No username set"}
                    </h1>
                    {!currentFullNameHidden ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {displayName || "Anonymous Chef"}
                      </p>
                    ) : null}
                  </>
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
                    {isOwnProfile && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={startEditing}
                        className="gap-2"
                      >
                        <Settings2 className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
