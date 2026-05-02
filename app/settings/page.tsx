"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useUser as useClerkUser } from "@clerk/nextjs"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useTutorial } from "@/contexts/tutorial-context"
import { Accessibility, Bell, BookOpen, FileText, HelpCircle, Info, Lock, LogOut, Mail, MapPin, MessageCircle, Palette, Shield, SlidersHorizontal, Utensils } from "lucide-react"
import { supabase } from "@/lib/database/supabase"
import { profileDB, type Profile } from "@/lib/database/profile-db"
import { TutorialSelectionModal } from "@/components/tutorial/tutorial-selection-modal"
import { AddressAutocompleteWithConsent } from "@/components/shared/address-autocomplete-with-consent"
import { CookieSettingsButton } from "@/components/privacy/cookie-settings-button"
import { useToast } from "@/hooks"
import { AuthGate } from "@/components/auth/tier-gate"
import { useRouter } from "next/navigation"
import { DIETARY_TAGS } from "@/lib/types"
import { formatDietaryTag } from "@/lib/tag-formatter"
import { useFeaturePreferences } from "@/hooks/use-feature-preferences"
import type { UserFeaturePreferences } from "@/lib/foundation/preferences"

type ProfileUpdates = Partial<Profile>

function getClerkErrorMessage(error: unknown): string {
  return (
    (error as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0]
      ?.longMessage ??
    (error as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0]
      ?.message ??
    (error as { message?: string })?.message ??
    "An unexpected error occurred."
  )
}

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsPageContent />
    </AuthGate>
  )
}

function SettingsPageContent() {
  const { user, profile, updateProfile, signOut } = useAuth()
  const { isLoaded: clerkLoaded, user: clerkUser } = useClerkUser()
  const { theme, setTheme } = useTheme()
  const {
    tutorialCompletedAt,
    resetTutorial,
  } = useTutorial()
  const { toast } = useToast()
  const router = useRouter()
  const {
    preferences: featurePreferences,
    updatePreferences,
    updating: featurePreferencesUpdating,
  } = useFeaturePreferences(Boolean(user))
  const [mounted, setMounted] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const [updatingEmail, setUpdatingEmail] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailVerificationCode, setEmailVerificationCode] = useState("")
  const pendingEmailAddressRef = useRef<any | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [showPasswordChange, setShowPasswordChange] = useState(false)

  const [primaryGoal, setPrimaryGoal] = useState("")
  const [cookingLevel, setCookingLevel] = useState("")
  const [budgetRange, setBudgetRange] = useState("")
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>([])
  const [cookingTimePreference, setCookingTimePreference] = useState("any")
  const [postalCode, setPostalCode] = useState("")
  const [formattedAddress, setFormattedAddress] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [stateRegion, setStateRegion] = useState("")
  const [country, setCountry] = useState("")
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [groceryDistance, setGroceryDistance] = useState("10")
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([])
  const [showTutorialModal, setShowTutorialModal] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">(theme === "dark" ? "dark" : "light")
  const preferencesRef = useRef<ProfileUpdates | null>(null)
  const lastSavedSnapshotRef = useRef<string>("")
  const hasRecordedInitialSnapshot = useRef(false)
  const shouldRecordInitialSnapshot = useRef(false)
  const hasPendingChangesRef = useRef(false)
  const savingRef = useRef(false)

  const cuisineOptions = [
    "Italian",
    "Mexican",
    "Asian",
    "Mediterranean",
    "American",
    "French",
    "Indian",
    "Thai",
    "Japanese",
    "Chinese",
    "Greek",
    "Spanish",
  ]

  const cookingTimeOptions = [
    { id: "quick", label: "Under 30 min" },
    { id: "medium", label: "30-60 min" },
    { id: "long", label: "Over 60 min" },
    { id: "any", label: "No preference" },
  ]

  const dietaryOptions = DIETARY_TAGS.map(formatDietaryTag)

  const primaryGoalOptions = [
    { id: "cooking", label: "Cook better meals", description: "Show more recipe and skill-building suggestions" },
    { id: "budgeting", label: "Save money", description: "Show more budget-friendly grocery suggestions" },
    { id: "both", label: "Both cooking and budget", description: "Show recipes that fit your budget" },
  ]

  const cookingLevelOptions = [
    { id: "beginner", label: "Beginner", description: "Simple recipes and guidance" },
    { id: "intermediate", label: "Intermediate", description: "Recipes with a few more steps" },
    { id: "advanced", label: "Advanced", description: "More complex recipes and methods" },
  ]

  const budgetRangeOptions = [
    { id: "low", label: "About $120/week", description: "Keep grocery spend tight" },
    { id: "medium", label: "About $200/week", description: "Use a moderate grocery budget" },
    { id: "high", label: "About $320/week", description: "Use a larger grocery budget" },
  ]

  const featureControlOptions: Array<{
    key: keyof Pick<
      UserFeaturePreferences,
      "budgetTrackingEnabled" | "streaksEnabled" | "socialEnabled" | "pantryEnabled"
    >
    label: string
  }> = [
    { key: "budgetTrackingEnabled", label: "Budget tracking" },
    { key: "streaksEnabled", label: "Streaks" },
    { key: "socialEnabled", label: "Social" },
    { key: "pantryEnabled", label: "Pantry" },
  ]

  const socialVisibilityOptions: Array<{
    value: UserFeaturePreferences["socialVisibilityDefault"]
    label: string
  }> = [
    { value: "private", label: "Private" },
    { value: "followers", label: "Followers" },
    { value: "public", label: "Public" },
  ]

  const confirmationModeOptions: Array<{
    value: UserFeaturePreferences["confirmationMode"]
    label: string
  }> = [
    { value: "ask_when_uncertain", label: "Ask when uncertain" },
    { value: "always_ask", label: "Always ask" },
    { value: "auto_accept_high_confidence", label: "Auto-accept high confidence" },
  ]

  const resourceLinks = [
    { label: "About", href: "/about", icon: Info },
    { label: "Help", href: "/help", icon: HelpCircle },
    { label: "Contact", href: "/contact", icon: Mail },
    { label: "Terms", href: "/terms", icon: FileText },
    { label: "Privacy", href: "/privacy", icon: Shield },
    { label: "Accessibility", href: "/accessibility", icon: Accessibility },
  ]

  const hydratePreferences = useCallback((profileData: Partial<Profile>) => {
    setPrimaryGoal(profileData.primary_goal || "")
    setCookingLevel(profileData.cooking_level || "")
    setBudgetRange(profileData.budget_range || "")
    setCuisinePreferences(profileData.cuisine_preferences || [])
    setCookingTimePreference(profileData.cooking_time_preference || "any")
    setPostalCode(profileData.zip_code || "")
    setFormattedAddress(profileData.formatted_address || "")
    setAddressLine1(profileData.address_line1 || "")
    setAddressLine2(profileData.address_line2 || "")
    setCity(profileData.city || "")
    setStateRegion(profileData.state || "")
    setCountry(profileData.country || "")
    setLat(profileData.latitude ?? null)
    setLng(profileData.longitude ?? null)
    setGroceryDistance(String(profileData.grocery_distance_miles || 10))
    setDietaryPreferences(profileData.dietary_preferences || [])
    setNewEmail(profileData.email || "")
  }, [])

  // Sync selectedTheme when theme context changes
  useEffect(() => {
    setSelectedTheme(theme === "dark" ? "dark" : "light")
  }, [theme])


  useEffect(() => {
    const payload: ProfileUpdates = {
      primary_goal: primaryGoal || null,
      cooking_level: cookingLevel || null,
      budget_range: budgetRange || null,
      cuisine_preferences: cuisinePreferences,
      cooking_time_preference: cookingTimePreference,
      zip_code: postalCode || null,
      formatted_address: formattedAddress || null,
      address_line1: addressLine1 || null,
      address_line2: addressLine2 || null,
      city: city || null,
      state: stateRegion || null,
      country: country || null,
      latitude: lat,
      longitude: lng,
      grocery_distance_miles: Number.parseInt(groceryDistance) || 10,
      dietary_preferences: dietaryPreferences,
      theme_preference: selectedTheme,
    }

    preferencesRef.current = payload
    const serialized = JSON.stringify(payload)

    if (!hasRecordedInitialSnapshot.current) {
      if (!shouldRecordInitialSnapshot.current) {
        return
      }
      hasRecordedInitialSnapshot.current = true
      lastSavedSnapshotRef.current = serialized
      hasPendingChangesRef.current = false
      return
    }

    hasPendingChangesRef.current = serialized !== lastSavedSnapshotRef.current
  }, [
    primaryGoal,
    cookingLevel,
    budgetRange,
    cuisinePreferences,
    cookingTimePreference,
    postalCode,
    formattedAddress,
    addressLine1,
    addressLine2,
    city,
    stateRegion,
    country,
    lat,
    lng,
    groceryDistance,
    dietaryPreferences,
    selectedTheme,
  ])

  const handleThemeChange = async (newTheme: "light" | "dark") => {
    setSelectedTheme(newTheme)
    setTheme(newTheme)

    if (user) {
      try {
        await updateProfile({ theme_preference: newTheme })

        const currentSnapshot = lastSavedSnapshotRef.current
          ? (JSON.parse(lastSavedSnapshotRef.current) as ProfileUpdates)
          : {}
        const nextSnapshot = { ...currentSnapshot, theme_preference: newTheme }
        lastSavedSnapshotRef.current = JSON.stringify(nextSnapshot)
      } catch (error) {
        console.error("Error saving theme preference:", error)
      }
    }
  }

  const fetchUserPreferences = useCallback(async function fetchUserPreferences() {
    if (!user) return

    try {
      const profileData = await profileDB.fetchProfileById(user.id)

      if (!profileData) {
        throw new Error("Failed to fetch user preferences")
      }

      hydratePreferences(profileData)

      // Initialize theme from database preference if available
      if (profileData.theme_preference) {
        setSelectedTheme(profileData.theme_preference === "dark" ? "dark" : "light")
        setTheme(profileData.theme_preference === "dark" ? "dark" : "light")
      }
    } catch (error) {
      console.error("Error fetching preferences:", error)
    } finally {
      shouldRecordInitialSnapshot.current = true
    }
  }, [hydratePreferences, setTheme, user])

  useEffect(() => {
    setMounted(true)
    if (profile) {
      hydratePreferences(profile)
      shouldRecordInitialSnapshot.current = true
      hasRecordedInitialSnapshot.current = false
      return
    }
    fetchUserPreferences()
  }, [fetchUserPreferences, hydratePreferences, profile, user])

  const handleCuisineToggle = (cuisine: string) => {
    setCuisinePreferences((prev) => (prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]))
  }

  const handleDietaryToggle = (diet: string) => {
    setDietaryPreferences((prev) => (prev.includes(diet) ? prev.filter((d) => d !== diet) : [...prev, diet]))
  }

  const handleFeaturePreferenceChange = <K extends keyof UserFeaturePreferences>(
    key: K,
    value: UserFeaturePreferences[K],
  ) => {
    updatePreferences({ [key]: value } as Partial<UserFeaturePreferences>)
  }

  const savePreferences = useCallback(async () => {
    if (!user || !preferencesRef.current) return
    if (!hasPendingChangesRef.current || savingRef.current) return

    savingRef.current = true
    try {
      await updateProfile(preferencesRef.current)
      lastSavedSnapshotRef.current = JSON.stringify(preferencesRef.current)
      hasPendingChangesRef.current = false
    } catch (error) {
      console.error("Error saving preferences:", error)
    } finally {
      savingRef.current = false
    }
  }, [updateProfile, user])

  const handleRewatchTutorial = () => {
    resetTutorial()
    setShowTutorialModal(true)
  }

  const handleUpdateEmail = async () => {
    if (!user || !newEmail || !clerkLoaded || !clerkUser) return

    if (newEmail === user.email) {
      toast({
        title: "No changes",
        description: "This is already your email address.",
        variant: "destructive",
      })
      return
    }

    setUpdatingEmail(true)
    try {
      const emailAddress = await clerkUser.createEmailAddress({ email: newEmail })
      await emailAddress.prepareVerification({ strategy: "email_code" })
      pendingEmailAddressRef.current = emailAddress
      setEmailVerificationCode("")

      toast({
        title: "Verification code sent",
        description: "Enter the code from your new email to finish the change.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: getClerkErrorMessage(error) || "Failed to update email. Please try again.",
        variant: "destructive",
      })
    } finally {
      setUpdatingEmail(false)
    }
  }

  const handleVerifyEmailCode = async () => {
    if (!clerkUser || !pendingEmailAddressRef.current || !emailVerificationCode) return

    setUpdatingEmail(true)
    try {
      const verifiedEmailAddress = await pendingEmailAddressRef.current.attemptVerification({
        code: emailVerificationCode,
      })
      await clerkUser.update({ primaryEmailAddressId: verifiedEmailAddress.id })
      await fetch("/api/auth/ensure-profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).catch(() => undefined)

      pendingEmailAddressRef.current = null
      setEmailVerificationCode("")

      toast({
        title: "Email updated",
        description: "Your primary email address has been changed.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: getClerkErrorMessage(error) || "Failed to verify email. Please try again.",
        variant: "destructive",
      })
    } finally {
      setUpdatingEmail(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!user || !newPassword || !clerkLoaded || !clerkUser) return

    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      })
      return
    }

    if (newPassword !== confirmNewPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords match.",
        variant: "destructive",
      })
      return
    }

    setUpdatingPassword(true)
    try {
      await clerkUser.updatePassword({
        newPassword,
        signOutOfOtherSessions: true,
      })

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      })

      // Reset form
      setNewPassword("")
      setConfirmNewPassword("")
      setShowPasswordChange(false)
    } catch (error) {
      toast({
        title: "Error",
        description: getClerkErrorMessage(error) || "Failed to update password. Please try again.",
        variant: "destructive",
      })
    } finally {
      setUpdatingPassword(false)
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return

    const flushChanges = () => {
      if (hasPendingChangesRef.current) {
        void savePreferences()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushChanges()
      }
    }

    window.addEventListener("pagehide", flushChanges)
    window.addEventListener("beforeunload", flushChanges)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("pagehide", flushChanges)
      window.removeEventListener("beforeunload", flushChanges)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      flushChanges()
    }
  }, [savePreferences])

  if (!mounted || !user) {
    return null
  }

  const isDark = selectedTheme === "dark"
  const sectionCardClass = "mb-4 border bg-card shadow-none"
  const sectionHeaderClass = "px-4 pb-2 pt-4 sm:px-5 sm:pt-5"
  const sectionContentClass = "space-y-5 px-4 pb-4 pt-2 sm:px-5 sm:pb-5"
  const titleClass = "text-base font-medium text-foreground"
  const descriptionClass = "text-sm text-muted-foreground"
  const iconClass = "h-4 w-4 text-muted-foreground"
  const optionButtonClass = (selected: boolean) =>
    `min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
      selected
        ? "border-primary bg-primary/10 text-foreground"
        : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    }`

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-4 pb-28 sm:px-6 sm:py-8 md:pb-10">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account, preferences, notifications, and support links.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Preference changes save when you leave.</p>
        </div>

        <Card className={sectionCardClass}>
          <CardHeader className={sectionHeaderClass}>
            <div className="flex items-center gap-2">
              <Palette className={iconClass} />
              <div>
                <CardTitle className={titleClass}>Appearance</CardTitle>
                <CardDescription className={descriptionClass}>Theme</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sectionContentClass}>
            <div className="flex min-h-12 items-center justify-between gap-4">
              <div>
                <Label htmlFor="theme-toggle" className="text-sm font-medium text-foreground">
                  Dark Mode
                </Label>
                <p className="text-xs text-muted-foreground">{isDark ? "On" : "Off"}</p>
              </div>
              <Switch
                id="theme-toggle"
                checked={isDark}
                onCheckedChange={(checked) => handleThemeChange(checked ? "dark" : "light")}
              />
            </div>
          </CardContent>
        </Card>

        <Card className={sectionCardClass}>
          <CardHeader className={sectionHeaderClass}>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className={iconClass} />
              <div>
                <CardTitle className={titleClass}>App features</CardTitle>
                <CardDescription className={descriptionClass}>Turn features on or off</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sectionContentClass}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {featureControlOptions.map((option) => (
                <div key={option.key} className="flex min-h-12 items-center justify-between gap-4 rounded-md border px-3 py-2">
                  <Label htmlFor={`feature-${option.key}`} className="text-sm font-medium text-foreground">
                    {option.label}
                  </Label>
                  <Switch
                    id={`feature-${option.key}`}
                    checked={Boolean(featurePreferences[option.key])}
                    disabled={featurePreferencesUpdating}
                    onCheckedChange={(checked) => handleFeaturePreferenceChange(option.key, checked)}
                  />
                </div>
              ))}
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-foreground">Default social visibility</Label>
              <div className="grid grid-cols-3 gap-2">
                {socialVisibilityOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => handleFeaturePreferenceChange("socialVisibilityDefault", option.value)}
                    className={optionButtonClass(featurePreferences.socialVisibilityDefault === option.value)}
                    disabled={featurePreferencesUpdating}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-foreground">Before AI changes something</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {confirmationModeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => handleFeaturePreferenceChange("confirmationMode", option.value)}
                    className={optionButtonClass(featurePreferences.confirmationMode === option.value)}
                    disabled={featurePreferencesUpdating}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="raw-media-retention-days" className="mb-1 block text-sm font-medium text-foreground">
                  Keep uploaded media for
                </Label>
                <Input
                  id="raw-media-retention-days"
                  type="number"
                  min="1"
                  max="30"
                  value={featurePreferences.rawMediaRetentionDays}
                  disabled={featurePreferencesUpdating}
                  onChange={(event) =>
                    handleFeaturePreferenceChange("rawMediaRetentionDays", Number(event.target.value) || 7)
                  }
                />
              </div>
              <div className="space-y-3">
                <div className="flex min-h-12 items-center justify-between gap-4 rounded-md border px-3 py-2">
                  <Label htmlFor="pantry-auto-deduct" className="text-sm font-medium text-foreground">
                    Pantry auto-deduct
                  </Label>
                  <Switch
                    id="pantry-auto-deduct"
                    checked={featurePreferences.pantryAutoDeductEnabled}
                    disabled={featurePreferencesUpdating}
                    onCheckedChange={(checked) => handleFeaturePreferenceChange("pantryAutoDeductEnabled", checked)}
                  />
                </div>
                <div className="flex min-h-12 items-center justify-between gap-4 rounded-md border px-3 py-2">
                  <Label htmlFor="nudges-enabled" className="text-sm font-medium text-foreground">
                    Reminders
                  </Label>
                  <Switch
                    id="nudges-enabled"
                    checked={featurePreferences.nudgesEnabled}
                    disabled={featurePreferencesUpdating}
                    onCheckedChange={(checked) => handleFeaturePreferenceChange("nudgesEnabled", checked)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={sectionCardClass} data-tutorial="settings-preferences">
          <CardHeader className={sectionHeaderClass}>
            <div className="flex items-center gap-2">
              <Utensils className={iconClass} />
              <div>
                <CardTitle className={titleClass}>Food preferences</CardTitle>
                <CardDescription className={descriptionClass}>Used for recipes and shopping suggestions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sectionContentClass}>
            <div>
              <Label className="mb-2 block text-sm font-medium text-foreground">Goal</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {primaryGoalOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => setPrimaryGoal(option.id)}
                    title={option.description}
                    className={optionButtonClass(primaryGoal === option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-foreground">Cooking level</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {cookingLevelOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => setCookingLevel(option.id)}
                    title={option.description}
                    className={optionButtonClass(cookingLevel === option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-foreground">Grocery budget</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {budgetRangeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => setBudgetRange(option.id)}
                    title={option.description}
                    className={optionButtonClass(budgetRange === option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-foreground">Favorite cuisines</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {cuisineOptions.map((cuisine) => (
                  <button
                    type="button"
                    key={cuisine}
                    onClick={() => handleCuisineToggle(cuisine)}
                    className={optionButtonClass(cuisinePreferences.includes(cuisine))}
                  >
                    {cuisine}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-foreground">Cooking time</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {cookingTimeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => setCookingTimePreference(option.id)}
                    className={optionButtonClass(cookingTimePreference === option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-foreground">Dietary restrictions</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {dietaryOptions.map((diet) => (
                  <button
                    type="button"
                    key={diet}
                    onClick={() => handleDietaryToggle(diet)}
                    className={optionButtonClass(dietaryPreferences.includes(diet))}
                  >
                    {diet}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={sectionCardClass}>
          <CardHeader className={sectionHeaderClass}>
            <div className="flex items-center gap-2">
              <MapPin className={iconClass} />
              <div>
                <CardTitle className={titleClass}>Location</CardTitle>
                <CardDescription className={descriptionClass}>Used to find nearby stores</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sectionContentClass}>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Home address</Label>
              <AddressAutocompleteWithConsent
                value={{
                  formattedAddress,
                  addressLine1,
                  addressLine2,
                  city,
                  state: stateRegion,
                  postalCode,
                  country,
                  lat,
                  lng,
                }}
                onChange={(addr) => {
                  setFormattedAddress(addr.formattedAddress || "")
                  setAddressLine1(addr.addressLine1 || "")
                  setAddressLine2(addr.addressLine2 || "")
                  setCity(addr.city || "")
                  setStateRegion(addr.state || "")
                  setCountry(addr.country || "")
                  setPostalCode(addr.postalCode || "")
                  setLat(addr.lat ?? null)
                  setLng(addr.lng ?? null)
                }}
                placeholder="Search your address"
              />
              <Input
                placeholder="Apartment, suite, etc. (optional)"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block text-sm font-medium text-foreground">City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
              </div>
              <div>
                <Label className="mb-1 block text-sm font-medium text-foreground">State</Label>
                <Input value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} placeholder="State" />
              </div>
              <div>
                <Label className="mb-1 block text-sm font-medium text-foreground">ZIP code</Label>
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="ZIP code" />
              </div>
              <div>
                <Label className="mb-1 block text-sm font-medium text-foreground">Country</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
              </div>
            </div>

            <div>
              <Label htmlFor="distance-settings" className="mb-1 block text-sm font-medium text-foreground">
                Store distance in miles
              </Label>
              <Input
                id="distance-settings"
                type="number"
                min="1"
                max="100"
                placeholder="10"
                value={groceryDistance}
                onChange={(e) => setGroceryDistance(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className={sectionCardClass}>
          <CardHeader className={sectionHeaderClass}>
            <div className="flex items-center gap-2">
              <BookOpen className={iconClass} />
              <div>
                <CardTitle className={titleClass}>Tutorial</CardTitle>
                <CardDescription className={descriptionClass}>Product walkthrough</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sectionContentClass}>
            {tutorialCompletedAt ? (
              <p className="text-sm text-muted-foreground">
                Completed {new Date(tutorialCompletedAt).toLocaleDateString("en-US")}
              </p>
            ) : null}
            <Button variant="outline" className="w-full justify-start" onClick={handleRewatchTutorial}>
              Start the Tour Again
            </Button>
          </CardContent>
        </Card>

        <Card className={sectionCardClass}>
          <CardHeader className={sectionHeaderClass}>
            <div className="flex items-center gap-2">
              <Lock className={iconClass} />
              <div>
                <CardTitle className={titleClass}>Account Security</CardTitle>
                <CardDescription className={descriptionClass}>Email and password</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sectionContentClass}>
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email address
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="your@email.com"
                />
                <Button
                  onClick={handleUpdateEmail}
                  disabled={updatingEmail || !clerkLoaded || !clerkUser || newEmail === user?.email}
                  variant="outline"
                  className="sm:w-28"
                >
                  {updatingEmail ? "Sending..." : "Update"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">New email addresses require a verification code.</p>
              {pendingEmailAddressRef.current && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={emailVerificationCode}
                    onChange={(e) => setEmailVerificationCode(e.target.value)}
                    placeholder="Verification code"
                  />
                  <Button
                    onClick={handleVerifyEmailCode}
                    disabled={updatingEmail || !emailVerificationCode}
                    variant="outline"
                    className="sm:w-28"
                  >
                    Verify
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Password
              </Label>
              {!showPasswordChange ? (
                <Button onClick={() => setShowPasswordChange(true)} variant="outline" className="w-full justify-start">
                  Change Password
                </Button>
              ) : (
                <div className="space-y-3">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 characters)"
                  />
                  <Input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={handleUpdatePassword}
                      disabled={updatingPassword || !clerkLoaded || !clerkUser || !newPassword || !confirmNewPassword}
                    >
                      {updatingPassword ? "Updating..." : "Update Password"}
                    </Button>
                    <Button
                      onClick={() => {
                        setShowPasswordChange(false)
                        setNewPassword("")
                        setConfirmNewPassword("")
                      }}
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <Label className="text-sm text-muted-foreground">Member since</Label>
              <p className="text-sm font-medium text-foreground">
                {new Date(user.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={sectionCardClass}>
          <CardHeader className={sectionHeaderClass}>
            <div className="flex items-center gap-2">
              <Bell className={iconClass} />
              <div>
                <CardTitle className={titleClass}>Notifications</CardTitle>
                <CardDescription className={descriptionClass}>Alerts and reminders</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sectionContentClass}>
            <div className="flex min-h-12 items-center justify-between gap-4">
              <Label className="text-sm font-medium text-foreground">Recipe updates</Label>
              <Switch defaultChecked />
            </div>
            <div className="flex min-h-12 items-center justify-between gap-4 border-t pt-4">
              <Label className="text-sm font-medium text-foreground">Meal reminders</Label>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card className={sectionCardClass}>
          <CardHeader className={sectionHeaderClass}>
            <div className="flex items-center gap-2">
              <HelpCircle className={iconClass} />
              <div>
                <CardTitle className={titleClass}>Help and legal</CardTitle>
                <CardDescription className={descriptionClass}>Support and policy links</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sectionContentClass}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {resourceLinks.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                >
                  <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  {label}
                </Link>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full justify-start gap-3"
              onClick={() => window.dispatchEvent(new CustomEvent("open-feedback-widget"))}
            >
              <MessageCircle className="h-4 w-4" />
              Send Feedback
            </Button>
            <CookieSettingsButton className="mt-2 min-h-12 w-full justify-start gap-3 rounded-md border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 hover:text-foreground" />
          </CardContent>
        </Card>

        <Card className={sectionCardClass} id="danger-zone">
          <CardHeader className={sectionHeaderClass}>
            <div className="flex items-center gap-2">
              <LogOut className={iconClass} />
              <div>
                <CardTitle className={titleClass}>Account</CardTitle>
                <CardDescription className={descriptionClass}>Session</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sectionContentClass}>
            <Button
              onClick={async () => {
                const ok = window.confirm("Sign out of Secret Sauce?")
                if (!ok) return
                setSigningOut(true)
                try {
                  await signOut()
                  toast({
                    title: "Signed out",
                    description: "You have been signed out successfully.",
                  })
                  router.push("/home")
                  router.refresh()
                } catch (error) {
                  console.error("Sign out error:", error)
                  toast({
                    title: "Error signing out",
                    description: "Please try again or refresh the page.",
                    variant: "destructive",
                  })
                } finally {
                  setSigningOut(false)
                }
              }}
              disabled={signingOut}
              variant="destructive"
              className="w-full justify-start sm:w-auto"
            >
              {signingOut ? "Signing out..." : "Sign Out"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <TutorialSelectionModal
        isOpen={showTutorialModal}
        onClose={() => setShowTutorialModal(false)}
        title="Start the Tour Again"
        description="Restart the shared Secret Sauce tour from the beginning."
        confirmLabel="Start Tour"
      />
    </div>
  )
}
