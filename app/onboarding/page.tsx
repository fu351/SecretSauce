"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChefHat, DollarSign, Users, MapPin, Clock, ArrowLeft, ArrowRight } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { useTheme } from "@/contexts/theme-context"
import { useTutorial } from "@/contexts/tutorial-context"
import { profileDB } from "@/lib/database/profile-db"
import { AddressAutocomplete } from "@/components/shared/address-autocomplete"
import type { TutorialPath } from "@/lib/types/tutorial"
import { DIETARY_TAGS, CUISINE_TYPES, DIFFICULTY_LEVELS, type DietaryTag, type CuisineType, type DifficultyLevel } from "@/lib/types"

const goals = [
  {
    id: "cooking",
    title: "Master the Craft",
    description: "Elevate your culinary skills with expert techniques",
    icon: ChefHat,
  },
  {
    id: "budgeting",
    title: "Optimize Resources",
    description: "Discover premium ingredients at exceptional value",
    icon: DollarSign,
  },
  {
    id: "both",
    title: "Elevate Your Journey",
    description: "Save time and prioritize your health with smart planning",
    icon: Users,
  },
]

const cookingLevels = [
  { id: "beginner" as DifficultyLevel, label: "Apprentice", description: "Beginning your culinary journey" },
  { id: "intermediate" as DifficultyLevel, label: "Practitioner", description: "Developing your technique" },
  { id: "advanced" as DifficultyLevel, label: "Master", description: "Refining your artistry" },
]

const budgetRanges = [
  { id: "low", label: "Essential", description: "Focused on fundamentals" },
  { id: "medium", label: "Balanced", description: "Quality and value" },
  { id: "high", label: "Premium", description: "Uncompromising excellence" },
]

const dietaryOptions = DIETARY_TAGS.map(tag => {
  // Capitalize first letter of each word for UI display
  return tag.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-')
}).filter(tag => tag !== 'Other') // Remove 'other' option

const cookingTimeOptions = [
  { id: "quick", label: "Quick Meals", description: "Under 30 minutes", icon: "⚡" },
  { id: "medium", label: "Moderate", description: "30-60 minutes", icon: "🕐" },
  { id: "long", label: "Leisurely", description: "60+ minutes", icon: "🍳" },
  { id: "any", label: "No Preference", description: "Any duration", icon: "✨" },
]

const cuisineOptions = CUISINE_TYPES.map(type => {
  // Capitalize and format for UI display
  return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}).filter(type => type !== 'Other') // Remove 'other' option

// Helper functions to convert UI display values back to database format
const convertDietaryToDb = (displayValue: string): string => {
  // Convert "Gluten-Free" -> "gluten-free", "Vegetarian" -> "vegetarian"
  return displayValue.toLowerCase().replace(/\s+/g, '-')
}

const convertCuisineToDb = (displayValue: string): string => {
  // Convert "Middle Eastern" -> "middle-eastern", "Italian" -> "italian"
  return displayValue.toLowerCase().replace(/\s+/g, '-')
}

const questionOrder = [
  {
    id: "goal",
    title: "Your Primary Intention",
    description: "What brings you to Secret Sauce?",
    required: true,
    autoAdvance: true,
  },
  {
    id: "cookingLevel",
    title: "Your Current Level",
    description: "Where are you in your culinary journey?",
    required: true,
    autoAdvance: true,
  },
  {
    id: "budget",
    title: "Your Investment",
    description: "How do you approach ingredient selection?",
    required: true,
    autoAdvance: true,
  },
  {
    id: "dietary",
    title: "Dietary Considerations",
    description: "Select any that apply (optional)",
    required: false,
    autoAdvance: false,
  },
  {
    id: "cuisine",
    title: "Cuisine Preferences",
    description: "Pick as many cuisines as you enjoy (optional)",
    required: false,
    autoAdvance: false,
  },
  {
    id: "cookingTime",
    title: "Preferred Cooking Time",
    description: "Choose the duration that suits your routine",
    required: true,
    autoAdvance: true,
  },
  {
    id: "location",
    title: "Location Preferences",
    description: "Help us find the best grocery stores near you",
    required: true,
    autoAdvance: false,
  },
  {
    id: "theme",
    title: "Choose Your Theme",
    description: "Pick a look you can always change later",
    required: true,
    autoAdvance: false,
  },
] as const

type QuestionId = (typeof questionOrder)[number]["id"]

export default function OnboardingPage() {
  // selectedGoal maps to TutorialPath: "cooking" | "budgeting" | "both" (→ "health")
  const [selectedGoal, setSelectedGoal] = useState("")
  const [cookingLevel, setCookingLevel] = useState("")
  const [budgetRange, setBudgetRange] = useState("")
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([])
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>([])
  const [cookingTimePreference, setCookingTimePreference] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [formattedAddress, setFormattedAddress] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [stateRegion, setStateRegion] = useState("")
  const [country, setCountry] = useState("")
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [groceryDistance, setGroceryDistance] = useState("")
  const [loading, setLoading] = useState(false)
  const { theme: currentTheme, setTheme } = useTheme()
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">(currentTheme === "dark" ? "dark" : "light")
  const [activeIndex, setActiveIndex] = useState(0)
  const lastStepIndex = questionOrder.length - 1
  const atLastStep = activeIndex === lastStepIndex

  const router = useRouter()
  const { updateProfile } = useAuth()
  const { toast } = useToast()
  const { startTutorial } = useTutorial()

  // Memoize address change handler to prevent autocomplete recreation
  const handleAddressChange = useCallback((addr: any) => {
    setFormattedAddress(addr.formattedAddress || "")
    setAddressLine1(addr.addressLine1 || "")
    setAddressLine2(addr.addressLine2 || "")
    setCity(addr.city || "")
    setStateRegion(addr.state || "")
    setCountry(addr.country || "")
    setPostalCode(addr.postalCode || "")
    setLat(addr.lat ?? null)
    setLng(addr.lng ?? null)
  }, [])

  useEffect(() => {
    // Force dark theme for onboarding experience on initial mount
    // User can change to warm mode in the theme selection question
    setTheme("dark")
    setSelectedTheme("dark")
  }, [])

  // Keep global theme in sync with selectedTheme when navigating between steps
  useEffect(() => {
    setTheme(selectedTheme)
  }, [selectedTheme, setTheme])

  const handleDietaryToggle = (option: string) => {
    setDietaryPreferences((prev) =>
      prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option],
    )
  }

  const handleCuisineToggle = (option: string) => {
    setCuisinePreferences((prev) =>
      prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option],
    )
  }

  const currentQuestion = questionOrder[activeIndex]

  const isStepComplete = (id: QuestionId) => {
    switch (id) {
      case "goal":
        return !!selectedGoal
      case "cookingLevel":
        return !!cookingLevel
      case "budget":
        return !!budgetRange
      case "dietary":
        return dietaryPreferences.length > 0
      case "cuisine":
        return cuisinePreferences.length > 0
      case "cookingTime":
        return !!cookingTimePreference
      case "location":
        return !!formattedAddress || !!postalCode || (!!lat && !!lng)
      case "theme":
        return !!selectedTheme
      default:
        return false
    }
  }

  const canProceedCurrent = () => {
    if (!currentQuestion) return false
    if (!currentQuestion.required) return true
    return isStepComplete(currentQuestion.id)
  }

  const allRequiredAnswered = questionOrder.filter((q) => q.required).every((q) => isStepComplete(q.id))

  const handleSingleSelect = (updateFn: (value: string) => void, value: string, questionId: QuestionId) => {
    updateFn(value)
    const questionConfig = questionOrder.find((question) => question.id === questionId)
    if (questionConfig?.autoAdvance) {
      setTimeout(() => {
        setActiveIndex((prev) => Math.min(prev + 1, lastStepIndex))
      }, 80)
    }
  }

  const goToStep = (index: number) => {
    const clamped = Math.max(0, Math.min(index, lastStepIndex))
    setActiveIndex(clamped)
  }

  const isDark = selectedTheme === "dark"

  const handleThemeChoice = (value: "light" | "dark") => {
    setSelectedTheme(value)
    setTheme(value)
  }

  const renderQuestion = (questionId: QuestionId) => {
    const meta = questionOrder.find((question) => question.id === questionId)
    if (!meta) return null

    switch (questionId) {
      case "goal":
        return (
          <Card className={`p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="space-y-4">
              {goals.map((goal) => {
                const Icon = goal.icon
                return (
                  <button
                    key={goal.id}
                    onClick={() => handleSingleSelect(setSelectedGoal, goal.id, "goal")}
                    className={`w-full p-6 rounded-lg border text-left transition-all ${
                      selectedGoal === goal.id
                        ? isDark
                          ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                          : "border-orange-600 bg-orange-100"
                        : isDark
                          ? "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                          : "border-orange-400 hover:border-orange-600 hover:bg-orange-100"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg border ${isDark ? "border-[#e8dcc4]/20 bg-[#e8dcc4]/5" : "border-orange-600 bg-orange-100"}`}>
                        <Icon className={`h-6 w-6 ${isDark ? "text-[#e8dcc4]" : "text-orange-700"}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className={`font-light text-lg mb-1 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{goal.title}</h3>
                        <p className={`text-sm font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{goal.description}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>
        )
      case "cookingLevel":
        return (
          <Card className={`p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="space-y-4">
              {cookingLevels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => handleSingleSelect(setCookingLevel, level.id, "cookingLevel")}
                  className={`w-full p-6 rounded-lg border text-left transition-all ${
                    cookingLevel === level.id
                      ? isDark
                        ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                        : "border-orange-600 bg-orange-100"
                      : isDark
                        ? "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                        : "border-orange-400 hover:border-orange-600 hover:bg-orange-100"
                  }`}
                >
                  <h3 className={`font-light text-lg mb-1 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{level.label}</h3>
                  <p className={`text-sm font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{level.description}</p>
                </button>
              ))}
            </div>
          </Card>
        )
      case "budget":
        return (
          <Card className={`p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="space-y-4">
              {budgetRanges.map((budget) => (
                <button
                  key={budget.id}
                  onClick={() => handleSingleSelect(setBudgetRange, budget.id, "budget")}
                  className={`w-full p-6 rounded-lg border text-left transition-all ${
                    budgetRange === budget.id
                      ? isDark
                        ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                        : "border-orange-600 bg-orange-100"
                      : isDark
                        ? "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                        : "border-orange-400 hover:border-orange-600 hover:bg-orange-100"
                  }`}
                >
                  <h3 className={`font-light text-lg mb-1 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{budget.label}</h3>
                  <p className={`text-sm font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{budget.description}</p>
                </button>
              ))}
            </div>
          </Card>
        )
      case "dietary":
        return (
          <Card className={`p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {dietaryOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleDietaryToggle(option)}
                  className={`p-4 rounded-lg border text-center transition-all font-light ${
                    dietaryPreferences.includes(option)
                      ? isDark
                        ? "border-[#e8dcc4] bg-[#e8dcc4]/10 text-[#e8dcc4]"
                        : "border-orange-600 bg-orange-100 text-amber-950"
                      : isDark
                        ? "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 text-[#e8dcc4]/60 hover:text-[#e8dcc4]"
                        : "border-orange-400 hover:border-orange-600 text-amber-900 hover:text-amber-950"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </Card>
        )
      case "cuisine":
        return (
          <Card className={`p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {cuisineOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleCuisineToggle(option)}
                  className={`p-4 rounded-lg border text-center transition-all font-light ${
                    cuisinePreferences.includes(option)
                      ? isDark
                        ? "border-[#e8dcc4] bg-[#e8dcc4]/10 text-[#e8dcc4]"
                        : "border-orange-600 bg-orange-100 text-amber-950"
                      : isDark
                        ? "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 text-[#e8dcc4]/60 hover:text-[#e8dcc4]"
                        : "border-orange-400 hover:border-orange-600 text-amber-900 hover:text-amber-950"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </Card>
        )
      case "cookingTime":
        return (
          <Card className={`p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="space-y-3">
              {cookingTimeOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSingleSelect(setCookingTimePreference, option.id, "cookingTime")}
                  className={`w-full p-4 rounded-lg border text-left transition-all ${
                    cookingTimePreference === option.id
                      ? isDark
                        ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                        : "border-orange-600 bg-orange-100"
                      : isDark
                        ? "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                        : "border-orange-400 hover:border-orange-600 hover:bg-orange-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{option.icon}</span>
                    <div>
                      <h3 className={`font-light text-lg ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{option.label}</h3>
                      <p className={`text-sm font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{option.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )
      case "location":
        return (
          <Card className={`p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="address" className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>
                  Home Address
                </Label>
                <div className="relative">
                  <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 ${isDark ? "text-[#e8dcc4]/40" : "text-orange-700"}`} />
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
                    onChange={handleAddressChange}
                    placeholder="Search your address"
                  />
                </div>
                <Input
                  id="address-line2"
                  type="text"
                  placeholder="Apartment, suite, etc. (optional)"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/40" : "bg-white border-orange-400 text-amber-950 placeholder:text-amber-700"}
                />
                <p className={`text-xs ${isDark ? "text-[#e8dcc4]/40" : "text-amber-900"}`}>Use the search to auto-complete your address for better store accuracy.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>City</Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white border-orange-400 text-amber-950"}
                  />
                </div>
                <div>
                  <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>State/Region</Label>
                  <Input
                    value={stateRegion}
                    onChange={(e) => setStateRegion(e.target.value)}
                    placeholder="State"
                    className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white border-orange-400 text-amber-950"}
                  />
                </div>
                <div>
                  <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>Postal Code</Label>
                  <Input
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="ZIP/Postal"
                    className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white border-orange-400 text-amber-950"}
                  />
                </div>
                <div>
                  <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>Country</Label>
                  <Input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Country"
                    className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white border-orange-400 text-amber-950"}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="distance" className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>
                    Maximum Distance (miles)
                  </Label>
                  <div className="relative">
                    <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 ${isDark ? "text-[#e8dcc4]/40" : "text-orange-700"}`} />
                    <Input
                      id="distance"
                      type="number"
                      min="1"
                      max="100"
                      placeholder="10"
                      value={groceryDistance}
                      onChange={(e) => setGroceryDistance(e.target.value)}
                      className={isDark ? "pl-10 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/40" : "pl-10 bg-white border-orange-400 text-amber-950 placeholder:text-amber-700"}
                    />
                  </div>
                  <p className={`text-xs mt-2 ${isDark ? "text-[#e8dcc4]/40" : "text-amber-900"}`}>How far are you willing to travel for groceries?</p>
                </div>
              </div>
            </div>
          </Card>
        )
      case "theme":
        return (
          <Card className={`p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
              <p className={`text-sm mt-3 ${isDark ? "text-[#e8dcc4]/50" : "text-amber-800"}`}>Click to preview — the entire page will update in real-time</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleThemeChoice("dark")}
                className={`p-4 rounded-lg border-2 text-left transition-all duration-300 ${
                  selectedTheme === "dark"
                    ? "border-[#e8dcc4] bg-[#0a0a0a] shadow-lg shadow-[#e8dcc4]/10 scale-105"
                    : "border-[#e8dcc4]/30 bg-[#0a0a0a]/60 hover:border-[#e8dcc4]/50 hover:scale-102"
                }`}
              >
                <div className="text-[#e8dcc4] text-sm font-medium mb-3">Dark Mode</div>
                <div className="space-y-2">
                  <div className="h-2 bg-[#e8dcc4]/20 rounded" />
                  <div className="h-2 bg-[#e8dcc4]/10 rounded w-3/4" />
                  <div className="h-2 bg-[#e8dcc4]/15 rounded w-5/6" />
                </div>
                {selectedTheme === "dark" && (
                  <div className="mt-3 pt-3 border-t border-[#e8dcc4]/20 text-xs text-[#e8dcc4]/70">Active</div>
                )}
              </button>
              <button
                onClick={() => handleThemeChoice("light")}
                className={`p-4 rounded-lg border-2 text-left transition-all duration-300 ${
                  selectedTheme === "light"
                    ? "border-orange-500 bg-gradient-to-br from-[#FAF4E5] to-orange-100 shadow-lg shadow-orange-500/20 scale-105"
                    : "border-orange-300 bg-gradient-to-br from-[#FAF4E5] to-orange-100 opacity-75 hover:opacity-95 hover:scale-102"
                }`}
              >
                <div className="text-orange-900 text-sm font-medium mb-3">Warm Mode</div>
                <div className="space-y-2">
                  <div className="h-2 bg-orange-300 rounded" />
                  <div className="h-2 bg-orange-200 rounded w-3/4" />
                  <div className="h-2 bg-orange-300/70 rounded w-5/6" />
                </div>
                {selectedTheme === "light" && (
                  <div className="mt-3 pt-3 border-t border-orange-300/30 text-xs text-orange-900/70">Active</div>
                )}
              </button>
            </div>
          </Card>
        )
      default:
        return null
    }
  }

  const handleComplete = async () => {
    if (!allRequiredAnswered) return
    setLoading(true)
    try {
      // Convert UI display values back to database format
      const dbDietaryPreferences = dietaryPreferences.map(convertDietaryToDb)
      const dbCuisinePreferences = cuisinePreferences.map(convertCuisineToDb)

      const onboardingData = {
        primary_goal: selectedGoal,
        cooking_level: cookingLevel,
        budget_range: budgetRange,
        dietary_preferences: dbDietaryPreferences,
        cuisine_preferences: dbCuisinePreferences,
        cooking_time_preference: cookingTimePreference,
        postal_code: postalCode || null,
        grocery_distance_miles: Number.parseInt(groceryDistance) || 10,
        theme_preference: selectedTheme,
        formatted_address: formattedAddress || null,
        address_line1: addressLine1 || null,
        address_line2: addressLine2 || null,
        city: city || null,
        state: stateRegion || null,
        country: country || null,
        latitude: lat,
        longitude: lng,
      }

      // Get the pending email from localStorage (stored during signup)
      const pendingEmail = localStorage.getItem('pending_verification_email')

      if (!pendingEmail) {
        toast({
          title: "Error",
          description: "Email not found. Please sign up again.",
          variant: "destructive",
        })
        router.push('/auth/signup')
        return
      }

      // Save onboarding data BEFORE email verification
      // This creates/updates the profile with the unverified email
      const profile = await profileDB.upsertProfile({
        email: pendingEmail,
        ...onboardingData,
      } as any, {
        onConflict: 'email'
      })

      if (!profile) {
        const error = new Error('Failed to save onboarding data')
        console.error('[Onboarding] Error saving to profiles:', error)
        throw error
      }

      console.log('[Onboarding] Successfully saved onboarding data to profiles table')

      toast({
        title: "Preferences saved!",
        description: "Now verify your email to get started.",
      })

      setTheme(selectedTheme)

      // Flow: User verifies email → /auth/callback → /welcome → tutorial auto-starts
      // The tutorial-context maps primary_goal to TutorialPath:
      //   "cooking" → "cooking", "budgeting" → "budgeting", "both" → "health"
      router.push("/auth/check-email")
    } catch (error) {
      console.error('[Onboarding] Error saving preferences:', error)
      toast({
        title: "Error",
        description: "Failed to save preferences. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`min-h-screen py-12 px-6 ${
      isDark ? "bg-[#181813] text-[#e8dcc4]" : "bg-[#FAF4E5] text-gray-900"
    }`}>
      <div className="max-w-6xl mx-auto lg:flex gap-12">
        <div className="flex-1 space-y-10">
          <header className="text-center lg:text-left">
            <div className="mb-8 flex justify-center lg:justify-start">
              <Image src={isDark ? "/logo-dark.png" : "/logo-warm.png"} alt="Secret Sauce" width={80} height={80} className="opacity-90" />
            </div>
            <p className={`uppercase tracking-[0.25em] text-xs mb-3 ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>Onboarding</p>
            <h1 className="text-4xl font-serif font-light mb-3 tracking-tight">Tell us about your kitchen.</h1>
            <p className={`text-lg font-light mb-6 ${isDark ? "text-[#e8dcc4]/60" : "text-gray-700"}`}>
              We'll use your answers to tailor recipes, grocery finds, and meal planning tools.
            </p>
            <div className={`rounded-lg p-4 mb-8 ${isDark ? "bg-[#e8dcc4]/5 border border-[#e8dcc4]/20" : "bg-orange-50 border border-orange-200"}`}>
              <p className={`text-sm ${isDark ? "text-[#e8dcc4]/70" : "text-orange-900/70"}`}>
                Don't worry if you'd like to change these preferences later — you can update everything in your settings at any time.
              </p>
            </div>
          </header>

          <div className="relative">
            <div
              key={currentQuestion.id}
              className="transition-all duration-200 ease-in-out transform"
            >
              {renderQuestion(currentQuestion.id)}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-6 flex-wrap">
            <Button
              variant="outline"
              onClick={() => goToStep(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="min-w-[100px]"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {questionOrder.map((step, idx) => {
                  const isActive = idx === activeIndex
                  const isVisited = idx < activeIndex
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => goToStep(idx)}
                      className={`px-3 py-2 rounded-full border text-sm transition-colors ${
                        isActive
                          ? isDark
                            ? "border-[#e8dcc4] text-[#181813] bg-[#e8dcc4]"
                            : "border-orange-500 text-white bg-orange-500"
                          : isVisited
                            ? isDark
                              ? "border-[#e8dcc4]/40 text-[#e8dcc4]"
                              : "border-orange-300 text-orange-700"
                            : isDark
                              ? "border-[#e8dcc4]/20 text-[#e8dcc4]/70"
                              : "border-orange-200 text-orange-500"
                      }`}
                    >
                      <span className="text-xs font-semibold mr-2">{idx + 1}</span>
                      <span className="text-xs">{step.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <Button
              onClick={() => {
                if (atLastStep) {
                  handleComplete()
                } else {
                  goToStep(activeIndex + 1)
                }
              }}
              disabled={
                loading || (currentQuestion?.required && !canProceedCurrent()) || (atLastStep && !allRequiredAnswered)
              }
              className={`min-w-[120px] py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                isDark
                  ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
                  : "bg-orange-500 text-white hover:bg-orange-600"
              }`}
            >
              {atLastStep ? "Finish" : "Next"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
          <p className={`text-xs text-center mt-3 ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>
            You can adjust these preferences anytime in settings.
          </p>
        </div>
      </div>
    </div>
  )
}
