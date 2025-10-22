"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { Palette, User, Bell, Shield, MapPin, Utensils } from "lucide-react"
import { supabase } from "@/lib/supabase"

export default function SettingsPage() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { toast } = useToast()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>([])
  const [cookingTimePreference, setCookingTimePreference] = useState("any")
  const [postalCode, setPostalCode] = useState("")
  const [groceryDistance, setGroceryDistance] = useState("10")
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

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

  const dietaryOptions = [
    "Vegetarian",
    "Vegan",
    "Gluten-Free",
    "Dairy-Free",
    "Keto",
    "Paleo",
    "Low-Carb",
    "High-Protein",
    "Nut-Free",
    "Soy-Free",
  ]

  useEffect(() => {
    setMounted(true)
    if (!user) {
      router.push("/auth/signin")
    } else {
      fetchUserPreferences()
    }
  }, [user, router])

  const fetchUserPreferences = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("cuisine_preferences, cooking_time_preference, postal_code, grocery_distance_km, dietary_preferences")
        .eq("id", user.id)
        .single()

      if (error) throw error

      if (data) {
        setCuisinePreferences(data.cuisine_preferences || [])
        setCookingTimePreference(data.cooking_time_preference || "any")
        setPostalCode(data.postal_code || "")
        setGroceryDistance(String(data.grocery_distance_km || 10))
        setDietaryPreferences(data.dietary_preferences || [])
      }
    } catch (error) {
      console.error("Error fetching preferences:", error)
    }
  }

  const savePreferences = async () => {
    if (!user) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          cuisine_preferences: cuisinePreferences,
          cooking_time_preference: cookingTimePreference,
          postal_code: postalCode || null,
          grocery_distance_km: Number.parseInt(groceryDistance) || 10,
          dietary_preferences: dietaryPreferences,
        })
        .eq("id", user.id)

      if (error) throw error

      toast({
        title: "Preferences saved",
        description: "Your preferences have been updated successfully.",
      })
    } catch (error) {
      console.error("Error saving preferences:", error)
      toast({
        title: "Error",
        description: "Failed to save preferences. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCuisineToggle = (cuisine: string) => {
    setCuisinePreferences((prev) => (prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]))
  }

  const handleDietaryToggle = (diet: string) => {
    setDietaryPreferences((prev) => (prev.includes(diet) ? prev.filter((d) => d !== diet) : [...prev, diet]))
  }

  if (!mounted || !user) {
    return null
  }

  const isDark = theme === "dark"

  return (
    <div className={`min-h-screen ${isDark ? "bg-[#0a0a0a]" : "bg-gray-50"}`}>
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-2 ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>Settings</h1>
          <p className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>Manage your account preferences</p>
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
                  {isDark ? "Mysterious and exclusive dark theme" : "Warm and inviting theme for everyday cooking"}
                </p>
              </div>
              <Switch id="theme-toggle" checked={isDark} onCheckedChange={toggleTheme} />
            </div>

            {/* Theme Preview */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  isDark ? "border-[#e8dcc4] bg-[#0a0a0a]" : "border-gray-300 bg-[#0a0a0a] opacity-50 hover:opacity-70"
                }`}
                onClick={() => !isDark && toggleTheme()}
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
                onClick={() => isDark && toggleTheme()}
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

        <Card className={`mb-6 ${isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}`}>
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
              <div className="space-y-2">
                {cookingTimeOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setCookingTimePreference(option.id)}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      cookingTimePreference === option.id
                        ? isDark
                          ? "border-[#e8dcc4] bg-[#e8dcc4]/5 text-[#e8dcc4]"
                          : "border-orange-500 bg-orange-50 text-orange-900"
                        : isDark
                          ? "border-[#e8dcc4]/20 text-[#e8dcc4]/60 hover:border-[#e8dcc4]/40"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {option.label}
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
            <div>
              <Label
                htmlFor="postal-code-settings"
                className={`mb-2 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}
              >
                Postal Code
              </Label>
              <Input
                id="postal-code-settings"
                type="text"
                placeholder="Enter your postal code"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
              />
            </div>

            <div>
              <Label
                htmlFor="distance-settings"
                className={`mb-2 block ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}
              >
                Maximum Distance (km)
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

        <Button
          onClick={savePreferences}
          disabled={loading}
          className={`w-full mb-6 ${
            isDark ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]" : "bg-orange-500 text-white hover:bg-orange-600"
          }`}
        >
          {loading ? "Saving..." : "Save Preferences"}
        </Button>

        {/* Account Settings */}
        <Card className={`mb-6 ${isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20" : "bg-white"}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <User className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-gray-700"}`} />
              <div>
                <CardTitle className={isDark ? "text-[#e8dcc4]" : "text-gray-900"}>Account</CardTitle>
                <CardDescription className={isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}>
                  Manage your account information
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className={`text-sm ${isDark ? "text-[#e8dcc4]/70" : "text-gray-600"}`}>Email</Label>
                <p className={`text-sm font-medium ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>{user.email}</p>
              </div>
              <div>
                <Label className={`text-sm ${isDark ? "text-[#e8dcc4]/70" : "text-gray-600"}`}>Member Since</Label>
                <p className={`text-sm font-medium ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                  {new Date(user.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
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
    </div>
  )
}
