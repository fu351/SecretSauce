"use client"

import { useEffect, useState, type ChangeEvent } from "react"
import Image from "next/image"
import { Camera, Check, Globe, Lock, Settings2, User } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/database/supabase"
import { normalizeUsername, validateUsername } from "@/lib/auth/username"

interface ProfileIdentityControlsProps {
  isOwnProfile: boolean
  fullName: string | null
  avatarUrl: string | null
  username: string | null
  isPrivate: boolean
}

export function ProfileIdentityControls({
  isOwnProfile,
  fullName,
  avatarUrl,
  username,
  isPrivate,
}: ProfileIdentityControlsProps) {
  const { user, updateProfile } = useAuth()
  const { toast } = useToast()
  const [displayName, setDisplayName] = useState(fullName ?? "")
  const [handle, setHandle] = useState(username ?? "")
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(avatarUrl)
  const [currentIsPrivate, setCurrentIsPrivate] = useState(isPrivate)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    setDisplayName(fullName ?? "")
  }, [fullName])

  useEffect(() => {
    setHandle(username ?? "")
  }, [username])

  useEffect(() => {
    setCurrentAvatarUrl(avatarUrl)
  }, [avatarUrl])

  useEffect(() => {
    setCurrentIsPrivate(isPrivate)
  }, [isPrivate])

  useEffect(() => {
    setIsEditing(false)
  }, [fullName, avatarUrl, username, isPrivate])

  if (isOwnProfile && !user) {
    return null
  }

  const initials = displayName
    ? displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  const hasUnsavedChanges =
    displayName !== (fullName ?? "") ||
    handle !== (username ?? "") ||
    currentAvatarUrl !== avatarUrl

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

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName)

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

  const handleUpdateFullName = async () => {
    setSavingName(true)
    try {
      await updateProfile({ full_name: displayName })
      toast({
        title: "Name updated",
        description: "Your name has been updated successfully.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update name. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSavingName(false)
    }
  }

  const handleUpdateUsername = async () => {
    const normalized = normalizeUsername(handle)
    const usernameError = validateUsername(normalized)
    if (usernameError) {
      toast({
        title: "Invalid username",
        description: usernameError,
        variant: "destructive",
      })
      return
    }

    setSavingUsername(true)
    try {
      await updateProfile({ username: normalized })
      setHandle(normalized)
      toast({
        title: "Username updated",
        description: `Your public profile is now @${normalized}.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update username.",
        variant: "destructive",
      })
    } finally {
      setSavingUsername(false)
    }
  }

  const handleTogglePrivacy = async () => {
    const nextValue = !currentIsPrivate
    setCurrentIsPrivate(nextValue)
    setSavingPrivacy(true)

    try {
      await updateProfile({ is_private: nextValue })
      toast({
        title: nextValue ? "Profile set to private" : "Profile set to public",
        description: nextValue
          ? "Only approved followers can see your profile details."
          : "Your profile is visible again.",
      })
    } catch (error) {
      setCurrentIsPrivate(!nextValue)
      toast({
        title: "Could not update privacy",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setSavingPrivacy(false)
    }
  }

  const privacyPill = isOwnProfile ? (
    <button
      type="button"
      onClick={handleTogglePrivacy}
      disabled={savingPrivacy}
      aria-label={currentIsPrivate ? "Set profile to public" : "Set profile to private"}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
        currentIsPrivate
          ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          : "bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
      } ${savingPrivacy ? "opacity-70" : ""}`}
    >
      {currentIsPrivate ? (
        <>
          <Lock className="h-3 w-3" />
          Private
        </>
      ) : (
        <>
          <Globe className="h-3 w-3" />
          Public
        </>
      )}
    </button>
  ) : (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        currentIsPrivate
          ? "bg-secondary text-secondary-foreground"
          : "bg-background text-foreground"
      }`}
      aria-label={currentIsPrivate ? "Private profile" : "Public profile"}
    >
      {currentIsPrivate ? (
        <>
          <Lock className="h-3 w-3" />
          Private
        </>
      ) : (
        <>
          <Globe className="h-3 w-3" />
          Public
        </>
      )}
    </div>
  )

  return (
    <section className="mb-8 rounded-lg bg-card/80 p-6 backdrop-blur">
      <div className="flex items-start gap-5">
        <div className="relative shrink-0">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-muted">
            {currentAvatarUrl ? (
              <Image
                src={currentAvatarUrl}
                alt={fullName ?? "Profile"}
                width={80}
                height={80}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-foreground">
                {initials}
              </div>
            )}
          </div>

          {isEditing && (
            <label className="absolute bottom-0 right-0 p-2 rounded-full cursor-pointer bg-primary text-primary-foreground shadow-sm">
              <Camera className="w-4 h-4" />
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
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {!isEditing ? (
                <>
                  <h1 className="text-2xl font-bold text-foreground">
                    {displayName || "Anonymous Chef"}
                  </h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {handle ? `@${handle}` : "No username set"}
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="profile-full-name" className="text-foreground">
                      Full Name
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="profile-full-name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Enter your name"
                      />
                      <Button onClick={handleUpdateFullName} variant="outline" disabled={savingName}>
                        {savingName ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-username" className="text-foreground">
                      Username
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="profile-username"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="your-handle"
                      />
                      <Button onClick={handleUpdateUsername} variant="outline" disabled={savingUsername}>
                        {savingUsername ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {privacyPill}

                {isOwnProfile && (
                  <Button
                    type="button"
                    variant={isEditing ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setIsEditing((current) => !current)}
                    className="gap-2"
                  >
                    {isEditing ? <Check className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
                    {isEditing ? "Done" : "Edit"}
                  </Button>
                )}
              </div>

            </div>
          </div>

          {isEditing && hasUnsavedChanges && (
            <p className="mt-3 text-xs text-muted-foreground">
              You have unsaved changes. Save each field before leaving edit mode.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
