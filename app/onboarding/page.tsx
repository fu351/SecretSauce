"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChefHat, DollarSign, Users, ArrowRight, Check } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"

const goals = [
  {
    id: "cooking",
    title: "Learn to Cook",
    description: "Discover new recipes and improve your cooking skills",
    icon: ChefHat,
    color: "bg-orange-100 text-orange-600 border-orange-200",
  },
  {
    id: "budgeting",
    title: "Save on Groceries",
    description: "Find the best deals and manage your food budget",
    icon: DollarSign,
    color: "bg-green-100 text-green-600 border-green-200",
  },
  {
    id: "both",
    title: "Both",
    description: "Cook better meals while saving money",
    icon: Users,
    color: "bg-blue-100 text-blue-600 border-blue-200",
  },
]

const cookingLevels = [
  { id: "beginner", label: "Beginner", description: "Just starting out" },
  { id: "intermediate", label: "Intermediate", description: "Some experience" },
  { id: "advanced", label: "Advanced", description: "Experienced cook" },
]

const budgetRanges = [
  { id: "low", label: "Budget-Conscious", description: "Under $50/week" },
  { id: "medium", label: "Moderate", description: "$50-100/week" },
  { id: "high", label: "Flexible", description: "$100+/week" },
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

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [selectedGoal, setSelectedGoal] = useState("")
  const [cookingLevel, setCookingLevel] = useState("")
  const [budgetRange, setBudgetRange] = useState("")
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const { updateProfile } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const handleDietaryToggle = (option: string) => {
    setDietaryPreferences((prev) =>
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
      })

      toast({
        title: "Welcome to Secret Sauce!",
        description: "Your preferences have been saved.",
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
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to Secret Sauce!</h1>
          <p className="text-xl text-gray-600">Let's personalize your experience</p>
        </div>

        {/* Progress indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((num) => (
              <div key={num} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step >= num ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {step > num ? <Check className="h-4 w-4" /> : num}
                </div>
                {num < 4 && <div className={`w-8 h-1 mx-2 ${step > num ? "bg-orange-500" : "bg-gray-200"}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Goal Selection */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>What's your main goal?</CardTitle>
              <CardDescription>This helps us customize your experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {goals.map((goal) => {
                const Icon = goal.icon
                return (
                  <button
                    key={goal.id}
                    onClick={() => setSelectedGoal(goal.id)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      selectedGoal === goal.id
                        ? "border-orange-500 bg-orange-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-lg ${goal.color}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{goal.title}</h3>
                        <p className="text-gray-600">{goal.description}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
              <Button onClick={() => setStep(2)} disabled={!selectedGoal} className="w-full mt-6">
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Cooking Level */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>What's your cooking experience?</CardTitle>
              <CardDescription>We'll recommend recipes that match your skill level</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {cookingLevels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setCookingLevel(level.id)}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    cookingLevel === level.id
                      ? "border-orange-500 bg-orange-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <h3 className="font-semibold text-gray-900">{level.label}</h3>
                  <p className="text-gray-600">{level.description}</p>
                </button>
              ))}
              <div className="flex gap-4 mt-6">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={!cookingLevel} className="flex-1">
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Budget Range */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>What's your grocery budget?</CardTitle>
              <CardDescription>This helps us find the best deals for you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {budgetRanges.map((budget) => (
                <button
                  key={budget.id}
                  onClick={() => setBudgetRange(budget.id)}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    budgetRange === budget.id
                      ? "border-orange-500 bg-orange-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <h3 className="font-semibold text-gray-900">{budget.label}</h3>
                  <p className="text-gray-600">{budget.description}</p>
                </button>
              ))}
              <div className="flex gap-4 mt-6">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  Back
                </Button>
                <Button onClick={() => setStep(4)} disabled={!budgetRange} className="flex-1">
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Dietary Preferences */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Any dietary preferences?</CardTitle>
              <CardDescription>Select all that apply (optional)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {dietaryOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleDietaryToggle(option)}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      dietaryPreferences.includes(option)
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                  Back
                </Button>
                <Button onClick={handleComplete} disabled={loading} className="flex-1">
                  {loading ? "Setting up..." : "Complete Setup"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
