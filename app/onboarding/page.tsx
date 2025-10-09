"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChefHat, DollarSign, Users, ArrowRight, Check, Sparkles, MapPin, Clock } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"

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

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [selectedGoal, setSelectedGoal] = useState("")
  const [cookingLevel, setCookingLevel] = useState("")
  const [budgetRange, setBudgetRange] = useState("")
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([])
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>([])
  const [cookingTimePreference, setCookingTimePreference] = useState("any")
  const [postalCode, setPostalCode] = useState("")
  const [groceryDistance, setGroceryDistance] = useState("10")
  const [loading, setLoading] = useState(false)

  const { updateProfile } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

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

  const handleComplete = async () => {
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
        title: "Welcome to the Circle",
        description: "Your culinary journey begins now.",
      })

      router.push("/dashboard")
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
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="mb-8 flex justify-center">
            <Image src="/logo-dark.png" alt="Secret Sauce" width={80} height={80} className="opacity-90" />
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#e8dcc4]/20 bg-[#e8dcc4]/5 mb-6">
            <Sparkles className="h-3 w-3 text-[#e8dcc4]" />
            <span className="text-xs tracking-widest uppercase text-[#e8dcc4]/80">Personalization</span>
          </div>
          <h1 className="text-4xl font-serif font-light mb-4 tracking-tight">Craft Your Experience</h1>
          <p className="text-lg text-[#e8dcc4]/60 font-light">Help us tailor your culinary journey</p>
        </div>

        {/* Progress indicator */}
        <div className="flex justify-center mb-12">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <div key={num} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-light border transition-all ${
                    step >= num
                      ? "bg-[#e8dcc4] text-[#181813] border-[#e8dcc4]"
                      : "bg-transparent text-[#e8dcc4]/40 border-[#e8dcc4]/20"
                  }`}
                >
                  {step > num ? <Check className="h-4 w-4" /> : num}
                </div>
                {num < 6 && (
                  <div
                    className={`w-12 h-[1px] mx-2 transition-all ${step > num ? "bg-[#e8dcc4]" : "bg-[#e8dcc4]/20"}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Goal Selection */}
        {step === 1 && (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">Your Primary Intention</h2>
              <p className="text-[#e8dcc4]/60 font-light">What brings you to Secret Sauce?</p>
            </div>
            <div className="space-y-4">
              {goals.map((goal) => {
                const Icon = goal.icon
                return (
                  <button
                    key={goal.id}
                    onClick={() => setSelectedGoal(goal.id)}
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
              <Button
                onClick={() => setStep(2)}
                disabled={!selectedGoal}
                className="w-full mt-8 bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] py-6 font-light tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Cooking Level */}
        {step === 2 && (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">Your Current Level</h2>
              <p className="text-[#e8dcc4]/60 font-light">Where are you in your culinary journey?</p>
            </div>
            <div className="space-y-4">
              {cookingLevels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setCookingLevel(level.id)}
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
              <div className="flex gap-4 mt-8">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1 border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 hover:border-[#e8dcc4]/60 py-6 font-light"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!cookingLevel}
                  className="flex-1 bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] py-6 font-light tracking-wide disabled:opacity-50"
                >
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 3: Budget Range */}
        {step === 3 && (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">Your Investment</h2>
              <p className="text-[#e8dcc4]/60 font-light">How do you approach ingredient selection?</p>
            </div>
            <div className="space-y-4">
              {budgetRanges.map((budget) => (
                <button
                  key={budget.id}
                  onClick={() => setBudgetRange(budget.id)}
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
              <div className="flex gap-4 mt-8">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="flex-1 border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 hover:border-[#e8dcc4]/60 py-6 font-light"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep(4)}
                  disabled={!budgetRange}
                  className="flex-1 bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] py-6 font-light tracking-wide disabled:opacity-50"
                >
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 4: Dietary Preferences */}
        {step === 4 && (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">Dietary Considerations</h2>
              <p className="text-[#e8dcc4]/60 font-light">Select any that apply (optional)</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-8">
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
            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => setStep(3)}
                className="flex-1 border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 hover:border-[#e8dcc4]/60 py-6 font-light"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep(5)}
                className="flex-1 bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] py-6 font-light tracking-wide"
              >
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 5: Cuisine & Cooking Time Preferences */}
        {step === 5 && (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">Culinary Preferences</h2>
              <p className="text-[#e8dcc4]/60 font-light">What cuisines and cooking times do you prefer?</p>
            </div>

            {/* Cuisine Preferences */}
            <div className="mb-8">
              <Label className="text-[#e8dcc4] mb-3 block">Favorite Cuisines (optional)</Label>
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
            </div>

            {/* Cooking Time Preference */}
            <div className="mb-8">
              <Label className="text-[#e8dcc4] mb-3 block">Preferred Cooking Time</Label>
              <div className="space-y-3">
                {cookingTimeOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setCookingTimePreference(option.id)}
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
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => setStep(4)}
                className="flex-1 border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 hover:border-[#e8dcc4]/60 py-6 font-light"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep(6)}
                className="flex-1 bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] py-6 font-light tracking-wide"
              >
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 6: Location Preferences for Grocery Shopping */}
        {step === 6 && (
          <Card className="bg-[#181813] border-[#e8dcc4]/20 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-serif font-light mb-3">Location Preferences</h2>
              <p className="text-[#e8dcc4]/60 font-light">Help us find the best grocery stores near you</p>
            </div>

            <div className="space-y-6 mb-8">
              <div>
                <Label htmlFor="postal-code" className="text-[#e8dcc4] mb-2 block">
                  Postal Code (optional)
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#e8dcc4]/40" />
                  <Input
                    id="postal-code"
                    type="text"
                    placeholder="Enter your postal code"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="pl-10 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/40"
                  />
                </div>
                <p className="text-[#e8dcc4]/40 text-xs mt-2">We'll use this to find nearby grocery stores</p>
              </div>

              <div>
                <Label htmlFor="distance" className="text-[#e8dcc4] mb-2 block">
                  Maximum Distance (km)
                </Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#e8dcc4]/40" />
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

            <div className="mb-6 p-4 rounded-lg bg-[#e8dcc4]/5 border border-[#e8dcc4]/10">
              <p className="text-[#e8dcc4]/70 text-sm text-center">
                💡 Don't worry! You can change all these preferences anytime in your settings.
              </p>
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => setStep(5)}
                className="flex-1 border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 hover:border-[#e8dcc4]/60 py-6 font-light"
              >
                Back
              </Button>
              <Button
                onClick={handleComplete}
                disabled={loading}
                className="flex-1 bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] py-6 font-light tracking-wide disabled:opacity-50"
              >
                {loading ? "Preparing..." : "Enter Secret Sauce"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
