"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChefHat, DollarSign, Users, Check, MapPin, Clock } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { useTheme } from "@/contexts/theme-context"

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
    title: "Complete Experience",
    description: "The full journey of culinary excellence",
    icon: Users,
  },
]

const cookingLevels = [
  { id: "beginner", label: "Apprentice", description: "Beginning your culinary journey" },
  { id: "intermediate", label: "Practitioner", description: "Developing your technique" },
  { id: "advanced", label: "Master", description: "Refining your artistry" },
]

const budgetRanges = [
  { id: "low", label: "Essential", description: "Focused on fundamentals" },
  { id: "medium", label: "Balanced", description: "Quality and value" },
  { id: "high", label: "Premium", description: "Uncompromising excellence" },
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

const cookingTimeOptions = [
  { id: "quick", label: "Quick Meals", description: "Under 30 minutes", icon: "⚡" },
  { id: "medium", label: "Moderate", description: "30-60 minutes", icon: "🕐" },
  { id: "long", label: "Leisurely", description: "60+ minutes", icon: "🍳" },
  { id: "any", label: "No Preference", description: "Any duration", icon: "✨" },
]

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
  const [selectedGoal, setSelectedGoal] = useState("")
  const [cookingLevel, setCookingLevel] = useState("")
  const [budgetRange, setBudgetRange] = useState("")
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([])
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>([])
  const [cookingTimePreference, setCookingTimePreference] = useState("any")
  const [postalCode, setPostalCode] = useState("")
  const [groceryDistance, setGroceryDistance] = useState("10")
  const [loading, setLoading] = useState(false)
  const { theme: currentTheme, setTheme } = useTheme()
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">(currentTheme === "dark" ? "dark" : "light")
  const questionRefs = useRef<Record<QuestionId, HTMLDivElement | null>>({})

  const router = useRouter()
  const { updateProfile } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    setTheme("light")
  }, [setTheme])

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

  const scrollToQuestion = (id: QuestionId) => {
    const node = questionRefs.current[id]
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const goToNextQuestion = (currentId: QuestionId) => {
    const currentIndex = questionOrder.findIndex((question) => question.id === currentId)
    if (currentIndex >= 0 && currentIndex < questionOrder.length - 1) {
      const nextQuestionId = questionOrder[currentIndex + 1].id
      scrollToQuestion(nextQuestionId)
    }
  }

  const questionCompletion: Record<QuestionId, boolean> = {
    goal: Boolean(selectedGoal),
    cookingLevel: Boolean(cookingLevel),
    budget: Boolean(budgetRange),
    dietary: true,
    cuisine: true,
    cookingTime: Boolean(cookingTimePreference),
    location: Boolean(groceryDistance),
    theme: Boolean(selectedTheme),
  }

  const allRequiredAnswered = questionOrder
    .filter((question) => question.required)
    .every((question) => questionCompletion[question.id])

  const handleSingleSelect = (updateFn: (value: string) => void, value: string, questionId: QuestionId) => {
    updateFn(value)
    const questionConfig = questionOrder.find((question) => question.id === questionId)
    if (questionConfig?.autoAdvance) {
      setTimeout(() => goToNextQuestion(questionId), 250)
    }
  }

  const setQuestionRef = (id: QuestionId) => (el: HTMLDivElement | null) => {
    questionRefs.current[id] = el
  }

  const renderQuestion = (questionId: QuestionId) => {
    const meta = questionOrder.find((question) => question.id === questionId)
    if (!meta) return null

    switch (questionId) {
      case "goal":
        return (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">{meta.title}</h2>
              <p className="text-[#e8dcc4]/60 font-light">{meta.description}</p>
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
                        ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                        : "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-lg border border-[#e8dcc4]/20 bg-[#e8dcc4]/5">
                        <Icon className="h-6 w-6 text-[#e8dcc4]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-light text-lg mb-1 text-[#e8dcc4]">{goal.title}</h3>
                        <p className="text-[#e8dcc4]/60 text-sm font-light">{goal.description}</p>
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
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">{meta.title}</h2>
              <p className="text-[#e8dcc4]/60 font-light">{meta.description}</p>
            </div>
            <div className="space-y-4">
              {cookingLevels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => handleSingleSelect(setCookingLevel, level.id, "cookingLevel")}
                  className={`w-full p-6 rounded-lg border text-left transition-all ${
                    cookingLevel === level.id
                      ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                      : "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                  }`}
                >
                  <h3 className="font-light text-lg mb-1 text-[#e8dcc4]">{level.label}</h3>
                  <p className="text-[#e8dcc4]/60 text-sm font-light">{level.description}</p>
                </button>
              ))}
            </div>
          </Card>
        )
      case "budget":
        return (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">{meta.title}</h2>
              <p className="text-[#e8dcc4]/60 font-light">{meta.description}</p>
            </div>
            <div className="space-y-4">
              {budgetRanges.map((budget) => (
                <button
                  key={budget.id}
                  onClick={() => handleSingleSelect(setBudgetRange, budget.id, "budget")}
                  className={`w-full p-6 rounded-lg border text-left transition-all ${
                    budgetRange === budget.id
                      ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                      : "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                  }`}
                >
                  <h3 className="font-light text-lg mb-1 text-[#e8dcc4]">{budget.label}</h3>
                  <p className="text-[#e8dcc4]/60 text-sm font-light">{budget.description}</p>
                </button>
              ))}
            </div>
          </Card>
        )
      case "dietary":
        return (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">{meta.title}</h2>
              <p className="text-[#e8dcc4]/60 font-light">{meta.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {dietaryOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleDietaryToggle(option)}
                  className={`p-4 rounded-lg border text-center transition-all font-light ${
                    dietaryPreferences.includes(option)
                      ? "border-[#e8dcc4] bg-[#e8dcc4]/10 text-[#e8dcc4]"
                      : "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 text-[#e8dcc4]/60 hover:text-[#e8dcc4]"
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
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">{meta.title}</h2>
              <p className="text-[#e8dcc4]/60 font-light">{meta.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {cuisineOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleCuisineToggle(option)}
                  className={`p-4 rounded-lg border text-center transition-all font-light ${
                    cuisinePreferences.includes(option)
                      ? "border-[#e8dcc4] bg-[#e8dcc4]/10 text-[#e8dcc4]"
                      : "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 text-[#e8dcc4]/60 hover:text-[#e8dcc4]"
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
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">{meta.title}</h2>
              <p className="text-[#e8dcc4]/60 font-light">{meta.description}</p>
            </div>
            <div className="space-y-3">
              {cookingTimeOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSingleSelect(setCookingTimePreference, option.id, "cookingTime")}
                  className={`w-full p-4 rounded-lg border text-left transition-all ${
                    cookingTimePreference === option.id
                      ? "border-[#e8dcc4] bg-[#e8dcc4]/5"
                      : "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40 hover:bg-[#e8dcc4]/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{option.icon}</span>
                    <div>
                      <h3 className="font-light text-lg text-[#e8dcc4]">{option.label}</h3>
                      <p className="text-[#e8dcc4]/60 text-sm font-light">{option.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )
      case "location":
        return (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">{meta.title}</h2>
              <p className="text-[#e8dcc4]/60 font-light">{meta.description}</p>
            </div>
            <div className="space-y-6">
              <div>
                <Label htmlFor="postal-code" className="text-[#e8dcc4] mb-2 block">
                  Postal Code (optional)
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#e8dcc4]/40" />
                  <Input
                    id="postal-code"
                    type="text"
                    placeholder="Enter your postal code"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="pl-10 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/40"
                  />
                </div>
                <p className="text-[#e8dcc4]/40 text-xs mt-2">We'll use this to find nearby grocery stores.</p>
              </div>
              <div>
                <Label htmlFor="distance" className="text-[#e8dcc4] mb-2 block">
                  Maximum Distance (km)
                </Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#e8dcc4]/40" />
                  <Input
                    id="distance"
                    type="number"
                    min="1"
                    max="100"
                    placeholder="10"
                    value={groceryDistance}
                    onChange={(e) => setGroceryDistance(e.target.value)}
                    className="pl-10 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/40"
                  />
                </div>
                <p className="text-[#e8dcc4]/40 text-xs mt-2">How far are you willing to travel for groceries?</p>
              </div>
            </div>
            <div className="mt-6 p-4 rounded-lg bg-[#e8dcc4]/5 border border-[#e8dcc4]/10 text-sm text-[#e8dcc4]/70">
              You can always adjust this later in settings.
            </div>
          </Card>
        )
      case "theme":
        return (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">{meta.title}</h2>
              <p className="text-[#e8dcc4]/60 font-light">{meta.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setSelectedTheme("dark")}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedTheme === "dark"
                    ? "border-[#e8dcc4] bg-[#0a0a0a]"
                    : "border-[#e8dcc4]/30 bg-[#0a0a0a]/60 hover:border-[#e8dcc4]/50"
                }`}
              >
                <div className="text-[#e8dcc4] text-xs font-medium mb-2">Dark Mode</div>
                <div className="space-y-2">
                  <div className="h-2 bg-[#e8dcc4]/20 rounded" />
                  <div className="h-2 bg-[#e8dcc4]/10 rounded w-3/4" />
                </div>
              </button>
              <button
                onClick={() => setSelectedTheme("light")}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedTheme === "light"
                    ? "border-orange-500 bg-gradient-to-br from-orange-50 to-yellow-50"
                    : "border-gray-600 bg-gradient-to-br from-orange-50 to-yellow-50 opacity-70 hover:opacity-90"
                }`}
              >
                <div className="text-gray-900 text-xs font-medium mb-2">Light Mode</div>
                <div className="space-y-2">
                  <div className="h-2 bg-orange-200 rounded" />
                  <div className="h-2 bg-orange-100 rounded w-3/4" />
                </div>
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
      await updateProfile({
        primary_goal: selectedGoal,
        cooking_level: cookingLevel,
        budget_range: budgetRange,
        dietary_preferences: dietaryPreferences,
        cuisine_preferences: cuisinePreferences,
        cooking_time_preference: cookingTimePreference,
        postal_code: postalCode || null,
        grocery_distance_km: Number.parseInt(groceryDistance) || 10,
      })

      toast({
        title: "All set!",
        description: "Check your email to verify your account.",
      })

      setTheme(selectedTheme)
      router.push("/check-email")
    } catch (error) {
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
    <div className="min-h-screen bg-[#181813] text-[#e8dcc4] py-12 px-6">
      <div className="max-w-6xl mx-auto lg:flex gap-12">
        <div className="flex-1 space-y-10">
          <header className="text-center lg:text-left">
            <div className="mb-8 flex justify-center lg:justify-start">
              <Image src="/logo-dark.png" alt="Secret Sauce" width={80} height={80} className="opacity-90" />
            </div>
            <p className="uppercase tracking-[0.25em] text-xs text-[#e8dcc4]/60 mb-3">Onboarding</p>
            <h1 className="text-4xl font-serif font-light mb-3 tracking-tight">Tell us about your kitchen.</h1>
            <p className="text-lg text-[#e8dcc4]/60 font-light">
              We’ll use your answers to tailor recipes, grocery finds, and meal planning tools.
            </p>
          </header>

          {questionOrder.map((question) => (
            <section
              key={question.id}
              ref={setQuestionRef(question.id)}
              id={`question-${question.id}`}
              className="scroll-mt-28"
            >
              {renderQuestion(question.id)}
            </section>
          ))}

          <div className="pt-4">
            <Button
              disabled={!allRequiredAnswered || loading}
              onClick={handleComplete}
              className="w-full bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] py-6 font-light tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Finish setup"}
            </Button>
            <p className="text-xs text-center text-[#e8dcc4]/60 mt-3">
              You can adjust these preferences anytime in settings.
            </p>
          </div>
        </div>

        <aside className="hidden lg:flex w-32">
          <div className="sticky top-10 flex flex-col items-center gap-5">
            {questionOrder.map((question, index) => (
              <button
                key={question.id}
                type="button"
                onClick={() => scrollToQuestion(question.id)}
                className="flex flex-col items-center gap-2 group focus:outline-none"
              >
                <div
                  className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm transition-all ${
                    questionCompletion[question.id]
                      ? "bg-[#e8dcc4] text-[#181813] border-[#e8dcc4]"
                      : "border-[#e8dcc4]/30 text-[#e8dcc4]/60 group-hover:border-[#e8dcc4] group-hover:text-[#e8dcc4]"
                  }`}
                >
                  {questionCompletion[question.id] ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span className="text-[11px] text-center text-[#e8dcc4]/60 group-hover:text-[#e8dcc4] leading-tight">
                  {question.title}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
