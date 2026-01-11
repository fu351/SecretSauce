"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useTutorial } from "@/contexts/tutorial-context"
import { useRouter } from "next/navigation"
import { Palette, User, Bell, Shield, MapPin, Utensils, BookOpen, Camera, Mail, Lock, UserCircle } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useProfileDB } from "@/lib/database/profile-db"
import { TutorialSelectionModal } from "@/components/tutorial/tutorial-selection-modal"
import type { Database } from "@/lib/supabase"
import { AddressAutocomplete } from "@/components/shared/address-autocomplete"
import { useToast } from "@/hooks"
import Image from "next/image"
import { DIETARY_TAGS } from "@/lib/types"
import { formatDietaryTag } from "@/lib/tag-formatter"

type ProfileUpdates = Database["public"]["Tables"]["profiles"]["Update"]

export default function SettingsPage() {
  const { user, updateProfile } = useAuth()
  const { theme, setTheme } = useTheme()
  const { tutorialCompleted: contextTutorialCompleted, tutorialCompletedAt: contextTutorialCompletedAt } = useTutorial()
  const router = useRouter()
  const { toast } = useToast()
  const profileDB = useProfileDB()
  const [mounted, setMounted] = useState(false)

  // Profile state
  const [fullName, setFullName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [updatingEmail, setUpdatingEmail] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [newEmail, setNewEmail] = useState("")
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
  const [tutorialCompleted, setTutorialCompleted] = useState(false)
  const [tutorialPath, setTutorialPath] = useState<string | null>(null)
  const [tutorialCompletedAt, setTutorialCompletedAt] = useState<string | null>(null)
  const [rewatchLoading, setRewatchLoading] = useState(false)
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
    { id: "quick", label: "Quick Meals (< 30 min)" },
    { id: "medium", label: "Moderate (30-60 min)" },
    { id: "long", label: "Leisurely (60+ min)" },
    { id: "any", label: "No Preference" },
  ]

  const dietaryOptions = DIETARY_TAGS.map(formatDietaryTag)

  const primaryGoalOptions = [
    { id: "cooking", label: "Master the Craft", description: "Elevate your culinary skills" },
    { id: "budgeting", label: "Optimize Resources", description: "Save money on groceries" },
    { id: "both", label: "Elevate Your Journey", description: "Save time and prioritize health" },
  ]

  const cookingLevelOptions = [
    { id: "beginner", label: "Apprentice", description: "Beginning your culinary journey" },
    { id: "intermediate", label: "Practitioner", description: "Developing your technique" },
    { id: "advanced", label: "Master", description: "Refining your artistry" },
  ]

  const budgetRangeOptions = [
    { id: "low", label: "Essential", description: "Focused on fundamentals" },
    { id: "medium", label: "Balanced", description: "Quality and value" },
    { id: "high", label: "Premium", description: "Uncompromising excellence" },
  ]

  useEffect(() => {
    setMounted(true)
    if (!user) {
      router.push("/auth/signin")
    } else {
      fetchUserPreferences()
    }
  }, [user, router])

  // Sync selectedTheme when theme context changes
  useEffect(() => {
    setSelectedTheme(theme === "dark" ? "dark" : "light")
  }, [theme])

  // Sync tutorial completion state from context
  useEffect(() => {
    if (contextTutorialCompleted) {
      setTutorialCompleted(contextTutorialCompleted)
    }
    if (contextTutorialCompletedAt) {
      setTutorialCompletedAt(contextTutorialCompletedAt)
    }
  }, [contextTutorialCompleted, contextTutorialCompletedAt])

  useEffect(() => {
    const payload: ProfileUpdates = {
      primary_goal: primaryGoal || null,
      cooking_level: cookingLevel || null,
      budget_range: budgetRange || null,
      cuisine_preferences: cuisinePreferences,
      cooking_time_preference: cookingTimePreference,
      postal_code: postalCode || null,
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

    if (typeof document !== "undefined") {
      if (newTheme === "dark") {
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
    }

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

  const fetchUserPreferences = async () => {
    if (!user) return

    try {
      const profile = await profileDB.fetchProfileById(user.id)

      if (!profile) {
        throw new Error("Failed to fetch user preferences")
      }

      setPrimaryGoal(profile.primary_goal || "")
      setCookingLevel(profile.cooking_level || "")
      setBudgetRange(profile.budget_range || "")
      setCuisinePreferences(profile.cuisine_preferences || [])
      setPostalCode(profile.postal_code || "")
      setFormattedAddress(profile.formatted_address || "")
      setLat(profile.latitude ?? null)
      setLng(profile.longitude ?? null)
      setGroceryDistance(String(profile.grocery_distance_miles || 10))
      setDietaryPreferences(profile.dietary_preferences || [])
      setTutorialCompleted(profile.tutorial_completed || false)
      setFullName(profile.full_name || "")
      setAvatarUrl(profile.avatar_url || null)
      setNewEmail(profile.email || "")

      // Initialize theme from database preference if available
      if (profile.theme_preference) {
        setSelectedTheme(profile.theme_preference === "dark" ? "dark" : "light")
        setTheme(profile.theme_preference === "dark" ? "dark" : "light")
      }
    } catch (error) {
      console.error("Error fetching preferences:", error)
    } finally {
      shouldRecordInitialSnapshot.current = true
    }
  }

  const handleCuisineToggle = (cuisine: string) => {
    setCuisinePreferences((prev) => (prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]))
  }

  const handleDietaryToggle = (diet: string) => {
    setDietaryPreferences((prev) => (prev.includes(diet) ? prev.filter((d) => d !== diet) : [...prev, diet]))
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
    setShowTutorialModal(true)
  }

  const handleUpdateFullName = async () => {
    if (!user) return
    try {
      await updateProfile({ full_name: fullName })
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
    }
  }

  const handleUpdateEmail = async () => {
    if (!user || !newEmail) return

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
      // Update email in Supabase Auth
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      if (error) throw error

      toast({
        title: "Verification email sent",
        description: "Please check your new email to confirm the change.",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update email. Please try again.",
        variant: "destructive",
      })
    } finally {
      setUpdatingEmail(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!user || !newPassword) return

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
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      })

      // Reset form
      setNewPassword("")
      setConfirmNewPassword("")
      setShowPasswordChange(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update password. Please try again.",
        variant: "destructive",
      })
    } finally {
      setUpdatingPassword(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files || e.target.files.length === 0) return

    const file = e.target.files[0]

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive",
      })
      return
    }

    // Validate file size (max 2MB)
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
      // Create unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      // Update profile with new avatar URL
      await updateProfile({ avatar_url: publicUrl })
      setAvatarUrl(publicUrl)

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

  return (
    <div className={`min-h-screen ${isDark ? "bg-[#0a0a0a]" : "bg-gray-50"}`}>
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-2 ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>Settings</h1>
          <p className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>Manage your account preferences</p>
          <p className={`text-sm mt-2 ${isDark ? "text-[#e8dcc4]/40" : "text-gray-500"}`}>
            Changes save automatically when you leave this page.
          </p>
        </div>

        {/* Theme Settings */}
        <Card className={`mb-6 ${isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Palette className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-gray-700"}`} />
              <div>
                <CardTitle className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>Appearance</CardTitle>
                <CardDescription className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>
                  Customize how Secret Sauce looks
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label
                  htmlFor="theme-toggle"
                  className={`text-sm font-medium ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}
                >
                  {isDark ? "Dark Mode" : "Warm Mode"}
                </Label>
                <p className={`text-sm ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>
                  {isDark ? "Mysterious and exclusive dark theme" : "Bright and inviting theme for everyday cooking"}
                </p>
              </div>
              <Switch
                id="theme-toggle"
                checked={isDark}
                onCheckedChange={(checked) => handleThemeChange(checked ? "dark" : "light")}
              />
            </div>

            {/* Theme Preview */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  isDark ? "border-[#e8dcc4] bg-[#0a0a0a]" : "border-gray-300 bg-[#0a0a0a] opacity-50 hover:opacity-70"
                }`}
                onClick={() => handleThemeChange("dark")}
              >
                <div className="text-[#e8dcc4] text-xs font-medium mb-2">Dark Mode</div>
                <div className="space-y-2">
                  <div className="h-2 bg-[#e8dcc4]/20 rounded"></div>
                  <div className="h-2 bg-[#e8dcc4]/10 rounded w-3/4"></div>
                </div>
              </div>

              <div
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  !isDark
                    ? "border-orange-500 bg-gradient-to-br from-orange-50 to-yellow-50"
                    : "border-gray-600 bg-gradient-to-br from-orange-50 to-yellow-50 opacity-50 hover:opacity-70"
                }`}
                onClick={() => handleThemeChange("light")}
              >
                <div className="text-gray-900 text-xs font-medium mb-2">Warm Mode</div>
                <div className="space-y-2">
                  <div className="h-2 bg-orange-200 rounded"></div>
                  <div className="h-2 bg-orange-100 rounded w-3/4"></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`mb-6 ${isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}`} data-tutorial="settings-preferences">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Utensils className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-gray-700"}`} />
              <div>
                <CardTitle className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>Culinary Preferences</CardTitle>
                <CardDescription className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>
                  Customize your recipe recommendations
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Primary Goal */}
            <div>
              <Label className={`mb-3 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                Your Primary Goal
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {primaryGoalOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setPrimaryGoal(option.id)}
                    title={option.description}
                    className={`p-3 rounded-lg border text-center transition-all group relative ${
                      primaryGoal === option.id
                        ? isDark
                          ? "border-[#e8dcc4] bg-[#e8dcc4]/5 text-[#e8dcc4]"
                          : "border-orange-500 bg-orange-50 text-orange-900"
                        : isDark
                          ? "border-[#e8dcc4]/20 text-[#e8dcc4]/60 hover:border-[#e8dcc4]/40"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-medium text-sm">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cooking Level */}
            <div>
              <Label className={`mb-3 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                Your Cooking Level
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {cookingLevelOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setCookingLevel(option.id)}
                    title={option.description}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      cookingLevel === option.id
                        ? isDark
                          ? "border-[#e8dcc4] bg-[#e8dcc4]/5 text-[#e8dcc4]"
                          : "border-orange-500 bg-orange-50 text-orange-900"
                        : isDark
                          ? "border-[#e8dcc4]/20 text-[#e8dcc4]/60 hover:border-[#e8dcc4]/40"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-medium text-sm">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Budget Range */}
            <div>
              <Label className={`mb-3 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                Your Budget Range
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {budgetRangeOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setBudgetRange(option.id)}
                    title={option.description}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      budgetRange === option.id
                        ? isDark
                          ? "border-[#e8dcc4] bg-[#e8dcc4]/5 text-[#e8dcc4]"
                          : "border-orange-500 bg-orange-50 text-orange-900"
                        : isDark
                          ? "border-[#e8dcc4]/20 text-[#e8dcc4]/60 hover:border-[#e8dcc4]/40"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-medium text-sm">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cuisine Preferences */}
            <div>
              <Label className={`mb-3 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>Favorite Cuisines</Label>
              <div className="grid grid-cols-3 gap-2">
                {cuisineOptions.map((cuisine) => (
                  <button
                    key={cuisine}
                    onClick={() => handleCuisineToggle(cuisine)}
                    className={`p-2 rounded-lg border text-sm transition-all ${
                      cuisinePreferences.includes(cuisine)
                        ? isDark
                          ? "border-[#e8dcc4] bg-[#e8dcc4]/10 text-[#e8dcc4]"
                          : "border-orange-500 bg-orange-50 text-orange-900"
                        : isDark
                          ? "border-[#e8dcc4]/20 text-[#e8dcc4]/60 hover:border-[#e8dcc4]/40"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {cuisine}
                  </button>
                ))}
              </div>
            </div>

            {/* Cooking Time Preference */}
            <div>
              <Label className={`mb-3 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                Preferred Cooking Time
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {cookingTimeOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setCookingTimePreference(option.id)}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      cookingTimePreference === option.id
                        ? isDark
                          ? "border-[#e8dcc4] bg-[#e8dcc4]/5 text-[#e8dcc4]"
                          : "border-orange-500 bg-orange-50 text-orange-900"
                        : isDark
                          ? "border-[#e8dcc4]/20 text-[#e8dcc4]/60 hover:border-[#e8dcc4]/40"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-medium text-sm">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Dietary Preferences */}
            <div>
              <Label className={`mb-3 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                Dietary Restrictions
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {dietaryOptions.map((diet) => (
                  <button
                    key={diet}
                    onClick={() => handleDietaryToggle(diet)}
                    className={`p-2 rounded-lg border text-sm transition-all ${
                      dietaryPreferences.includes(diet)
                        ? isDark
                          ? "border-[#e8dcc4] bg-[#e8dcc4]/10 text-[#e8dcc4]"
                          : "border-orange-500 bg-orange-50 text-orange-900"
                        : isDark
                          ? "border-[#e8dcc4]/20 text-[#e8dcc4]/60 hover:border-[#e8dcc4]/40"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {diet}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`mb-6 ${isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <MapPin className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-gray-700"}`} />
              <div>
                <CardTitle className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>Location Preferences</CardTitle>
                <CardDescription className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>
                  Set your location for grocery store recommendations
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>Home Address</Label>
              <AddressAutocomplete
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
                className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/40" : ""}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>City</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
                />
              </div>
              <div>
                <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>State/Region</Label>
                <Input
                  value={stateRegion}
                  onChange={(e) => setStateRegion(e.target.value)}
                  placeholder="State"
                  className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
                />
              </div>
              <div>
                <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>Postal Code</Label>
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="ZIP/Postal"
                  className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
                />
              </div>
              <div>
                <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>Country</Label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                  className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
                />
              </div>
            </div>

            <div>
              <Label
                htmlFor="distance-settings"
                className={`mb-2 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}
              >
                Maximum Distance (mi)
              </Label>
              <Input
                id="distance-settings"
                type="number"
                min="1"
                max="100"
                placeholder="10"
                value={groceryDistance}
                onChange={(e) => setGroceryDistance(e.target.value)}
                className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
              />
            </div>
          </CardContent>
        </Card>
        {/* Learning & Tutorials - Only appears if tutorial is completed */}
        {tutorialCompleted && (
          <Card className={`mb-6 ${isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}`}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <BookOpen className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-gray-700"}`} />
                <div>
                  <CardTitle className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>
                    Learning & Tutorials
                  </CardTitle>
                  <CardDescription className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>
                    Rewatch your onboarding tutorial anytime
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Completion Stats */}
                {tutorialPath && (
                  <div className={`p-3 rounded-lg ${isDark ? "bg-[#e8dcc4]/5 border border-[#e8dcc4]/20" : "bg-orange-50 border border-orange-200"}`}>
                    <p className={`text-sm ${isDark ? "text-[#e8dcc4]/70" : "text-gray-600"}`}>
                      <span className="font-medium">Last completed:</span>{" "}
                      {tutorialPath === "cooking"
                        ? "Mastering the Craft"
                        : tutorialPath === "budgeting"
                        ? "Optimize Resources"
                        : "Elevate Your Journey"}
                    </p>
                    {tutorialCompletedAt && (
                      <p className={`text-xs mt-1 ${isDark ? "text-[#e8dcc4]/50" : "text-gray-500"}`}>
                        {new Date(tutorialCompletedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                )}

                {/* Action Button */}
                <Button
                  onClick={handleRewatchTutorial}
                  disabled={rewatchLoading}
                  className={`w-full ${
                    isDark
                      ? "bg-[#e8dcc4]/10 text-[#e8dcc4] border border-[#e8dcc4]/30 hover:bg-[#e8dcc4]/20"
                      : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                  }`}
                  variant="outline"
                >
                  {rewatchLoading ? "Loading..." : "Rewatch Tutorial"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {/* Profile Settings */}
        <Card className={`mb-6 ${isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <UserCircle className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-gray-700"}`} />
              <div>
                <CardTitle className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>Profile</CardTitle>
                <CardDescription className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>
                  Update your personal information
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Upload */}
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className={`w-24 h-24 rounded-full overflow-hidden border-2 ${isDark ? "border-[#e8dcc4]/20" : "border-gray-300"}`}>
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Profile"
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${isDark ? "bg-[#e8dcc4]/10" : "bg-gray-100"}`}>
                      <User className={`w-12 h-12 ${isDark ? "text-[#e8dcc4]/40" : "text-gray-400"}`} />
                    </div>
                  )}
                </div>
                <label htmlFor="avatar-upload" className={`absolute bottom-0 right-0 p-2 rounded-full cursor-pointer ${isDark ? "bg-[#e8dcc4] text-[#0a0a0a]" : "bg-orange-500 text-white"}`}>
                  <Camera className="w-4 h-4" />
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="flex-1">
                <Label className={`text-sm font-medium ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                  Profile Picture
                </Label>
                <p className={`text-xs mt-1 ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>
                  {uploadingAvatar ? "Uploading..." : "Click the camera icon to upload a new photo (max 2MB)"}
                </p>
              </div>
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full-name" className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>
                Full Name
              </Label>
              <div className="flex gap-2">
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your name"
                  className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
                />
                <Button
                  onClick={handleUpdateFullName}
                  variant="outline"
                  className={isDark ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10" : ""}
                >
                  Save
                </Button>
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className={`flex items-center gap-2 ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                <Mail className="w-4 h-4" />
                Email Address
              </Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="your@email.com"
                  className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
                />
                <Button
                  onClick={handleUpdateEmail}
                  disabled={updatingEmail || newEmail === user?.email}
                  variant="outline"
                  className={isDark ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 disabled:opacity-50" : ""}
                >
                  {updatingEmail ? "Sending..." : "Update"}
                </Button>
              </div>
              <p className={`text-xs ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>
                You'll need to verify your new email address
              </p>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label className={`flex items-center gap-2 ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                <Lock className="w-4 h-4" />
                Password
              </Label>
              {!showPasswordChange ? (
                <Button
                  onClick={() => setShowPasswordChange(true)}
                  variant="outline"
                  className={`w-full ${isDark ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10" : ""}`}
                >
                  Change Password
                </Button>
              ) : (
                <div className="space-y-3">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 characters)"
                    className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
                  />
                  <Input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleUpdatePassword}
                      disabled={updatingPassword || !newPassword || !confirmNewPassword}
                      className={isDark ? "bg-[#e8dcc4] text-[#0a0a0a] hover:bg-[#d4c8b0]" : ""}
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
                      className={isDark ? "text-[#e8dcc4]/70 hover:text-[#e8dcc4]" : ""}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Member Since (readonly) */}
            <div className={`pt-4 border-t ${isDark ? "border-[#e8dcc4]/20" : "border-gray-200"}`}>
              <Label className={`text-sm ${isDark ? "text-[#e8dcc4]/70" : "text-gray-600"}`}>Member Since</Label>
              <p className={`text-sm font-medium ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                {new Date(user.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className={`mb-6 ${isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Bell className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-gray-700"}`} />
              <div>
                <CardTitle className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>Notifications</CardTitle>
                <CardDescription className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>
                  Manage your notification preferences
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className={`text-sm font-medium ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                    Recipe Updates
                  </Label>
                  <p className={`text-sm ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>
                    Get notified about new recipes
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className={`text-sm font-medium ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                    Meal Reminders
                  </Label>
                  <p className={`text-sm ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>
                    Reminders for planned meals
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card className={isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-gray-700"}`} />
              <div>
                <CardTitle className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>Privacy & Security</CardTitle>
                <CardDescription className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>
                  Control your privacy settings
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className={`text-sm font-medium ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                    Public Profile
                  </Label>
                  <p className={`text-sm ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>
                    Make your recipes visible to others
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tutorial Selection Modal */}
      <TutorialSelectionModal
        isOpen={showTutorialModal}
        onClose={() => setShowTutorialModal(false)}
      />
    </div>
  )
}
