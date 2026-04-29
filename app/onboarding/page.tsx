"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChefHat, DollarSign, Users, MapPin, Clock, ArrowLeft, ArrowRight, Loader2, Sparkles, Zap } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/ui/use-toast"
import { useTheme } from "@/contexts/theme-context"
import { AddressAutocomplete } from "@/components/shared/address-autocomplete"
import { DIETARY_TAGS, CUISINE_TYPES, type DifficultyLevel } from "@/lib/types"
const goals = [
  {
    id: "cooking" as const,
    title: "Plan meals",
    description: "Build weekly plans and find recipes faster",
    icon: ChefHat,
  },
  {
    id: "budgeting" as const,
    title: "Save money",
    description: "Compare grocery costs and stay near budget",
    icon: DollarSign,
  },
  {
    id: "health" as const,
    title: "Eat intentionally",
    description: "Filter by dietary needs, time, and nutrition goals",
    icon: Users,
  },
]

type GoalId = "cooking" | "budgeting" | "health"

const cookingLevels = [
  { id: "beginner" as DifficultyLevel, label: "Beginner", description: "I want simple recipes and clear steps" },
  { id: "intermediate" as DifficultyLevel, label: "Intermediate", description: "I cook often and want more ideas" },
  { id: "advanced" as DifficultyLevel, label: "Advanced", description: "I am comfortable with detailed recipes" },
]

const budgetRanges = [
  { id: "low", label: "About $120/week", description: "Keep grocery spend tight and cost-focused" },
  { id: "medium", label: "About $200/week", description: "Balance budget, variety, and convenience" },
  { id: "high", label: "About $320/week", description: "Plan with more room for higher-cost items" },
]

const dietaryOptions = DIETARY_TAGS.map(tag => {
  // Capitalize first letter of each word for UI display
  return tag.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join("-")
}).filter(tag => tag !== "Other") // Remove 'other' option

const cookingTimeOptions = [
  { id: "quick", label: "Under 30 minutes", description: "Fast meals", icon: Zap },
  { id: "medium", label: "30-60 minutes", description: "Standard meals", icon: Clock },
  { id: "long", label: "Over 60 minutes", description: "Longer recipes", icon: ChefHat },
  { id: "any", label: "No preference", description: "Any length is fine", icon: Sparkles },
]

const cuisineOptions = CUISINE_TYPES.map(type => {
  // Capitalize and format for UI display
  return type.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}).filter(type => type !== "Other") // Remove 'other' option

// Helper functions to convert UI display values back to database format
const convertDietaryToDb = (displayValue: string): string => {
  // Convert "Gluten-Free" -> "gluten-free", "Vegetarian" -> "vegetarian"
  return displayValue.toLowerCase().replace(/\s+/g, "-")
}

const convertCuisineToDb = (displayValue: string): string => {
  // Convert "Middle Eastern" -> "middle-eastern", "Italian" -> "italian"
  return displayValue.toLowerCase().replace(/\s+/g, "-")
}

function buildGoalRankingFromProfile(primary: string | null | undefined): GoalId[] {
  const base: GoalId[] = ["cooking", "budgeting", "health"]
  if (!primary) return base
  const g = primary as GoalId
  if (!goals.some((x) => x.id === g)) return base
  return [g, ...base.filter((x) => x !== g)]
}

function dbDietaryToDisplay(db: string): string | undefined {
  const key = db.toLowerCase().replace(/\s+/g, "-")
  return dietaryOptions.find((opt) => convertDietaryToDb(opt) === key)
}

function dbCuisineToDisplay(db: string): string | undefined {
  const key = db.toLowerCase().replace(/\s+/g, "-")
  return cuisineOptions.find((opt) => convertCuisineToDb(opt) === key)
}

const questionOrder = [
  {
    id: "goal",
    title: "What should Secret Sauce optimize for?",
    description: "This sets your default recommendations.",
    required: true,
    autoAdvance: true,
  },
  {
    id: "cookingLevel",
    title: "How much recipe guidance do you want?",
    description: "Used to tune recipe difficulty and instructions.",
    required: true,
    autoAdvance: true,
  },
  {
    id: "budget",
    title: "What weekly grocery budget should we plan around?",
    description: "Used by meal planning, shopping, and dashboard tracking.",
    required: true,
    autoAdvance: true,
  },
  {
    id: "dietary",
    title: "Any dietary filters?",
    description: "Optional filters for recipes and meal plans.",
    required: false,
    autoAdvance: false,
  },
  {
    id: "cuisine",
    title: "What cuisines should we favor?",
    description: "Optional signals for recommendations.",
    required: false,
    autoAdvance: false,
  },
  {
    id: "cookingTime",
    title: "How much cooking time should we assume?",
    description: "Used to rank recipes and weekly plans.",
    required: true,
    autoAdvance: true,
  },
  {
    id: "location",
    title: "Where should we search for groceries?",
    description: "Needed for store matching and price-aware shopping.",
    required: true,
    autoAdvance: false,
  },
  {
    id: "theme",
    title: "Choose your app theme",
    description: "You can change it later in settings.",
    required: true,
    autoAdvance: false,
  },
] as const

type QuestionId = (typeof questionOrder)[number]["id"]

export default function OnboardingPage() {
  // goalRanking: ordered array where index 0 = rank 1 (most important)
  const [goalRanking, setGoalRanking] = useState<GoalId[]>(["cooking", "budgeting", "health"])
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
  const { setTheme } = useTheme()
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">("dark")
  const [activeIndex, setActiveIndex] = useState(0)
  const lastStepIndex = questionOrder.length - 1
  const atLastStep = activeIndex === lastStepIndex
  const hydratedFromProfile = useRef(false)

  const router = useRouter()
  const { user, profile, loading: authLoading, updateProfile } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/auth/signin")
    }
  }, [authLoading, user, router])

  useEffect(() => {
    document.body.classList.add("onboarding-route")
    return () => document.body.classList.remove("onboarding-route")
  }, [])

  useEffect(() => {
    if (!profile || hydratedFromProfile.current) return
    hydratedFromProfile.current = true

    setGoalRanking(buildGoalRankingFromProfile(profile.primary_goal))

    if (profile.cooking_level && cookingLevels.some((l) => l.id === profile.cooking_level)) {
      setCookingLevel(profile.cooking_level)
    }
    if (profile.budget_range && budgetRanges.some((b) => b.id === profile.budget_range)) {
      setBudgetRange(profile.budget_range)
    }

    const dietary = (profile.dietary_preferences ?? [])
      .map(dbDietaryToDisplay)
      .filter((x): x is string => Boolean(x))
    setDietaryPreferences(dietary)

    const cuisines = (profile.cuisine_preferences ?? [])
      .map(dbCuisineToDisplay)
      .filter((x): x is string => Boolean(x))
    setCuisinePreferences(cuisines)

    if (
      profile.cooking_time_preference &&
      cookingTimeOptions.some((o) => o.id === profile.cooking_time_preference)
    ) {
      setCookingTimePreference(profile.cooking_time_preference)
    }

    if (profile.formatted_address) setFormattedAddress(profile.formatted_address)
    if (profile.address_line1) setAddressLine1(profile.address_line1)
    if (profile.address_line2) setAddressLine2(profile.address_line2 ?? "")
    if (profile.city) setCity(profile.city)
    if (profile.state) setStateRegion(profile.state)
    if (profile.country) setCountry(profile.country)
    if (profile.zip_code) setPostalCode(profile.zip_code)
    if (profile.latitude != null) setLat(profile.latitude)
    if (profile.longitude != null) setLng(profile.longitude)
    if (profile.grocery_distance_miles != null) {
      setGroceryDistance(String(profile.grocery_distance_miles))
    }

    if (profile.theme_preference === "light" || profile.theme_preference === "dark") {
      setSelectedTheme(profile.theme_preference)
      setTheme(profile.theme_preference)
    }
  }, [profile, setTheme])

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

  useLayoutEffect(() => {
    // Force dark theme for onboarding experience on initial mount only.
    // User can change to warm mode in the theme selection question.
    setTheme("dark")
  }, [setTheme])

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
        return goalRanking.length === 3
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
        return !!formattedAddress || !!postalCode || !!city
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

  const handleGoalSelect = (value: GoalId) => {
    setGoalRanking([value, ...goals.map((goal) => goal.id).filter((id) => id !== value)])
    setTimeout(() => {
      setActiveIndex((prev) => Math.min(prev + 1, lastStepIndex))
    }, 80)
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
          <Card className={`p-4 sm:p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-3 sm:mb-6">
              <h2 className={`text-xl sm:text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`text-sm font-light sm:text-base ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="space-y-2 sm:space-y-3">
              {goals.map((goal) => {
                const Icon = goal.icon
                const selected = goalRanking[0] === goal.id
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => handleGoalSelect(goal.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all sm:p-5 ${
                      selected
                        ? isDark
                          ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                          : "border-orange-600 bg-orange-100"
                        : isDark
                          ? "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                          : "border-orange-400 hover:border-orange-600 hover:bg-orange-100"
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                      isDark ? "border-[#e8dcc4]/20 bg-[#e8dcc4]/5" : "border-orange-600 bg-orange-100"
                    }`}>
                      <Icon className={`h-4 w-4 ${isDark ? "text-[#e8dcc4]" : "text-orange-700"}`} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium sm:text-base ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{goal.title}</span>
                      <span className={`block text-xs leading-snug ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{goal.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>
        )
      case "cookingLevel":
        return (
          <Card className={`p-4 sm:p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-3 sm:mb-8">
              <h2 className={`text-xl sm:text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="space-y-2 sm:space-y-4">
              {cookingLevels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => handleSingleSelect(setCookingLevel, level.id, "cookingLevel")}
                  className={`w-full rounded-lg border p-3 sm:p-6 text-left transition-all ${
                    cookingLevel === level.id
                      ? isDark
                        ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                        : "border-orange-600 bg-orange-100"
                      : isDark
                        ? "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                        : "border-orange-400 hover:border-orange-600 hover:bg-orange-100"
                  }`}
                >
                  <h3 className={`font-light text-base sm:text-lg mb-1 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{level.label}</h3>
                  <p className={`text-sm font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{level.description}</p>
                </button>
              ))}
            </div>
          </Card>
        )
      case "budget":
        return (
          <Card className={`p-4 sm:p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-3 sm:mb-8">
              <h2 className={`text-xl sm:text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="space-y-2 sm:space-y-4">
              {budgetRanges.map((budget) => (
                <button
                  key={budget.id}
                  onClick={() => handleSingleSelect(setBudgetRange, budget.id, "budget")}
                  className={`w-full rounded-lg border p-3 sm:p-6 text-left transition-all ${
                    budgetRange === budget.id
                      ? isDark
                        ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                        : "border-orange-600 bg-orange-100"
                      : isDark
                        ? "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                        : "border-orange-400 hover:border-orange-600 hover:bg-orange-100"
                  }`}
                >
                  <h3 className={`font-light text-base sm:text-lg mb-1 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{budget.label}</h3>
                  <p className={`text-sm font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{budget.description}</p>
                </button>
              ))}
            </div>
          </Card>
        )
      case "dietary":
        return (
          <Card className={`p-4 sm:p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-3 sm:mb-8">
              <h2 className={`text-xl sm:text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {dietaryOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleDietaryToggle(option)}
                  className={`rounded-lg border p-2 text-center text-xs transition-all font-light sm:p-4 sm:text-sm ${
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
          <Card className={`p-4 sm:p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-3 sm:mb-8">
              <h2 className={`text-xl sm:text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3">
              {cuisineOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleCuisineToggle(option)}
                  className={`rounded-lg border p-2 text-center text-xs transition-all font-light sm:p-4 sm:text-sm ${
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
          <Card className={`p-4 sm:p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-3 sm:mb-8">
              <h2 className={`text-xl sm:text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
            </div>
            <div className="space-y-3">
              {cookingTimeOptions.map((option) => {
                const TimeIcon = option.icon
                return (
                  <button
                    key={option.id}
                    onClick={() => handleSingleSelect(setCookingTimePreference, option.id, "cookingTime")}
                    className={`w-full rounded-lg border p-3 text-left transition-all sm:p-4 ${
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
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                        isDark ? "border-[#e8dcc4]/20 bg-[#e8dcc4]/5" : "border-orange-600 bg-orange-100"
                      }`}>
                        <TimeIcon className={`h-4 w-4 ${isDark ? "text-[#e8dcc4]" : "text-orange-700"}`} />
                      </span>
                      <div>
                        <h3 className={`font-light text-base sm:text-lg ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{option.label}</h3>
                        <p className={`text-sm font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{option.description}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>
        )
      case "location":
        return (
          <Card className={`p-4 sm:p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-3 sm:mb-8">
              <h2 className={`text-xl sm:text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
              <p className={`text-xs mt-2 ${isDark ? "text-[#e8dcc4]/40" : "text-amber-800"}`}>At minimum, enter a city or postal code to continue.</p>
            </div>
            <div className="space-y-3 sm:space-y-6">
              <div className="space-y-2 sm:space-y-3">
                <Label htmlFor="address" className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>
                  Address search
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
                <p className={`hidden text-xs sm:block ${isDark ? "text-[#e8dcc4]/40" : "text-amber-900"}`}>Use the search to auto-complete your address for better store accuracy.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
                  <Label className={`mb-1 block ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>Postal Code</Label>
                  <Input
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="ZIP/Postal"
                    className={isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white border-orange-400 text-amber-950"}
                  />
                </div>
                <div className="sm:col-span-2">
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
          <Card className={`p-4 sm:p-8 ${isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-[#FFF8F0] border-orange-600"}`}>
            <div className="mb-3 sm:mb-8">
              <h2 className={`text-xl sm:text-2xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-amber-950"}`}>{meta.title}</h2>
              <p className={`font-light ${isDark ? "text-[#e8dcc4]/60" : "text-amber-900"}`}>{meta.description}</p>
              <p className={`text-sm mt-3 ${isDark ? "text-[#e8dcc4]/50" : "text-amber-800"}`}>Click a theme to preview it.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <button
                onClick={() => handleThemeChoice("dark")}
                className={`rounded-lg border-2 p-3 text-left transition-all duration-300 sm:p-4 ${
                  selectedTheme === "dark"
                    ? "border-[#e8dcc4] bg-[#0a0a0a] shadow-lg shadow-[#e8dcc4]/10 scale-105"
                    : "border-[#e8dcc4]/30 bg-[#0a0a0a]/60 hover:border-[#e8dcc4]/50 hover:scale-102"
                }`}
              >
                <div className="text-[#e8dcc4] text-sm font-medium mb-3">Dark mode</div>
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
                className={`rounded-lg border-2 p-3 text-left transition-all duration-300 sm:p-4 ${
                  selectedTheme === "light"
                    ? "border-orange-500 bg-gradient-to-br from-[#FAF4E5] to-orange-100 shadow-lg shadow-orange-500/20 scale-105"
                    : "border-orange-300 bg-gradient-to-br from-[#FAF4E5] to-orange-100 opacity-75 hover:opacity-95 hover:scale-102"
                }`}
              >
                <div className="text-orange-900 text-sm font-medium mb-3">Light mode</div>
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
        primary_goal: goalRanking[0],
        cooking_level: cookingLevel,
        budget_range: budgetRange,
        dietary_preferences: dbDietaryPreferences,
        cuisine_preferences: dbCuisinePreferences,
        cooking_time_preference: cookingTimePreference,
        zip_code: postalCode || null,
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

      if (!user?.id || !user?.email) {
        toast({
          title: "Error",
          description: "Please sign in to complete onboarding.",
          variant: "destructive",
        })
        router.push("/auth/signin")
        return
      }

      await updateProfile(onboardingData)

      toast({
        title: "Preferences saved!",
        description: "Your profile is ready.",
      })

      setTheme(selectedTheme)

      router.push("/welcome")
    } catch (error) {
      console.error("[Onboarding] Error saving preferences:", error)
      const msg = error instanceof Error ? error.message : "Failed to save preferences. Please try again."
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#181813] text-[#e8dcc4]">
        <Loader2 className="h-10 w-10 animate-spin opacity-80" aria-hidden />
        <p className="text-sm font-light opacity-70">Loading your profile...</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className={`h-[100svh] overflow-hidden px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:h-auto sm:min-h-[100svh] sm:overflow-visible sm:px-6 sm:py-10 ${
      isDark ? "bg-[#181813] text-[#e8dcc4]" : "bg-[#FAF4E5] text-gray-900"
    }`}>
      <div className="mx-auto flex h-full max-w-2xl flex-col sm:h-auto">
        <div className="flex min-h-0 flex-1 flex-col space-y-3 sm:block sm:space-y-8">
          <header className="shrink-0 text-center">
            <div className="mb-4 hidden justify-center sm:mb-6 sm:flex">
              <Image src={isDark ? "/logo-dark.png" : "/logo-warm.png"} alt="Secret Sauce" width={64} height={64} className="opacity-90 sm:h-20 sm:w-20" />
            </div>
            <p className={`uppercase tracking-[0.2em] text-[10px] mb-1 sm:mb-3 sm:text-[11px] ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>Onboarding</p>
            <h1 className="text-2xl sm:text-4xl font-serif font-light mb-1 sm:mb-3 tracking-tight">Set up your preferences.</h1>
            <p className={`mx-auto max-w-md text-xs sm:text-lg font-light mb-2 sm:mb-6 leading-relaxed ${isDark ? "text-[#e8dcc4]/60" : "text-gray-700"}`}>
              We&apos;ll use your answers for recipes, grocery suggestions, and meal planning.
            </p>
            <div className={`hidden rounded-lg px-4 py-3 sm:block ${isDark ? "bg-[#e8dcc4]/5 border border-[#e8dcc4]/20" : "bg-orange-50 border border-orange-200"}`}>
              <p className={`text-sm ${isDark ? "text-[#e8dcc4]/70" : "text-orange-900/70"}`}>
                You can change these settings later.
              </p>
            </div>
          </header>

          <div className="relative min-h-0 flex-1 sm:block">
            <div
              key={currentQuestion.id}
              className="transition-all duration-200 ease-in-out transform"
            >
              {renderQuestion(currentQuestion.id)}
            </div>
          </div>

          <div className="z-20 -mx-4 mt-auto shrink-0 border-t bg-inherit px-4 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:static sm:mx-0 sm:mt-4 sm:border-0 sm:px-0 sm:py-0">
            <div className="mb-3 flex items-center justify-center sm:mb-4">
              <div className="flex max-w-full items-center gap-1 overflow-x-auto px-1 py-1 scrollbar-hide">
                {questionOrder.map((step, idx) => {
                  const isActive = idx === activeIndex
                  const isVisited = idx < activeIndex
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => goToStep(idx)}
                      aria-label={`Go to step ${idx + 1}: ${step.title}`}
                      className={`h-8 min-w-8 rounded-full border px-2 text-xs transition-colors sm:h-auto sm:min-w-0 sm:px-3 sm:py-2 sm:text-sm ${
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
                      <span className="font-semibold">{idx + 1}</span>
                      <span className="hidden sm:ml-2 sm:inline">{step.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-3 sm:flex sm:items-center sm:justify-between">
              <Button
                variant="outline"
                onClick={() => goToStep(activeIndex - 1)}
                disabled={activeIndex === 0}
                className="h-11 min-w-11 px-3 sm:min-w-[100px]"
              >
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Button>

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
                className={`h-11 w-full py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed sm:min-w-[120px] sm:w-auto ${
                  isDark
                    ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
                    : "bg-orange-500 text-white hover:bg-orange-600"
                }`}
              >
                {atLastStep ? "Finish" : "Next"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
          <p className={`hidden text-xs text-center mt-3 sm:block ${isDark ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>
            You can change these settings anytime.
          </p>
        </div>
      </div>
    </div>
  )
}
