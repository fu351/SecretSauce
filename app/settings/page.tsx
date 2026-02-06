"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { useTheme } from "@/contexts/theme-context"
import { useTutorial } from "@/contexts/tutorial-context"
import { useRouter } from "next/navigation"
import { Palette, User, Bell, Shield, MapPin, Utensils, BookOpen } from "lucide-react"
import { profileDB, type Profile } from "@/lib/database/profile-db"
import { TutorialSelectionModal } from "@/components/tutorial/tutorial-selection-modal"
import { AddressAutocomplete } from "@/components/shared/address-autocomplete"
import { UserProfile } from "@clerk/nextjs"
import { dark } from "@clerk/themes";
import { useToast } from "@/hooks"
import Image from "next/image"
import { DIETARY_TAGS } from "@/lib/types"
import { formatDietaryTag } from "@/lib/tag-formatter"

type ProfileUpdates = Partial<Profile>

export default function SettingsPage() {
  const { user, isLoaded } = useUser()
  const updateProfile = async (data: Record<string, any>) => {
    if (!user) return
    return await user.update({
      unsafeMetadata: {
        ...user.unsafeMetadata,
        ...data,
      },
    })
  }
  const { theme, setTheme } = useTheme()
  const { tutorialCompleted: contextTutorialCompleted, tutorialCompletedAt: contextTutorialCompletedAt } = useTutorial()
  const router = useRouter()
  const { toast } = useToast()
  const [mounted, setMounted] = useState(false)

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
    if (isLoaded && !user) {
      router.push("/auth/signin")
    }
    if (user) {
        const profile = user.unsafeMetadata as Profile;
        const primaryEmail = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress;

        setPrimaryGoal(profile.primary_goal || "")
        setCookingLevel(profile.cooking_level || "")
        setBudgetRange(profile.budget_range || "")
        setCuisinePreferences(profile.cuisine_preferences || [])
        setPostalCode(profile.zip_code || "")
        setFormattedAddress(profile.formatted_address || "")
        setLat(profile.latitude ?? null)
        setLng(profile.longitude ?? null)
        setGroceryDistance(String(profile.grocery_distance_miles || 10))
        setDietaryPreferences(profile.dietary_preferences || [])
        setTutorialCompleted(profile.tutorial_completed || false)
        setFullName(user.fullName || "")
        setAvatarUrl(user.imageUrl || null)
        setNewEmail(primaryEmail || "")

        if (profile.theme_preference) {
            setSelectedTheme(profile.theme_preference === "dark" ? "dark" : "light")
            setTheme(profile.theme_preference === "dark" ? "dark" : "light")
        }
        shouldRecordInitialSnapshot.current = true
    }
  }, [user, isLoaded, router, setTheme])

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

  if (!isLoaded || !user) {
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
        {/* Account & Security */}
        <Card className={`mb-6 ${isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-gray-700"}`} />
              <div>
                <CardTitle className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>Account & Security</CardTitle>
                <CardDescription className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>
                  Manage your email, password, and account settings
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <UserProfile
              appearance={{
                baseTheme: isDark ? dark : undefined,
                elements: {
                  card: "bg-transparent shadow-none",
                  navbar: "hidden",
                  header: "hidden",
                  rootBox: "w-full",
                  formFieldInput: isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : undefined,
                },
              }}
            />
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
      </div>

      {/* Tutorial Selection Modal */}
      <TutorialSelectionModal
        isOpen={showTutorialModal}
        onClose={() => setShowTutorialModal(false)}
      />
    </div>
  )
}
