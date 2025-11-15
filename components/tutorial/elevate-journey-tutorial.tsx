"use client"

import { Clock, Leaf, Heart, BookOpen, ShoppingCart, Zap, Sparkles } from "lucide-react"
import { TutorialContainer, TutorialStep } from "./tutorial-container"
import { useRouter } from "next/navigation"

const elevateSteps: TutorialStep[] = [
  {
    id: 1,
    title: "Elevate Your Lifestyle",
    description: "Save time and prioritize your health",
    longDescription:
      "Welcome to a smarter way of eating. By planning your meals strategically, you'll save time during the week, make healthier choices, and reduce decision fatigue. Your wellness journey starts with smart planning.",
    icon: <Heart className="w-8 h-8 text-pink-500" />,
    action: "screenshot",
    actionLabel: "Let's Get Started",
    estimatedSeconds: 20,
  },
  {
    id: 2,
    title: "Master Meal Planning",
    description: "One plan. All week covered.",
    longDescription:
      "Strategic meal planning is the foundation. Plan your entire week at once—breakfast, lunch, dinner. This single action eliminates daily decisions, saves hours each week, and helps you eat healthier by design.",
    icon: <Clock className="w-8 h-8 text-blue-500" />,
    action: "navigate",
    actionTarget: "/meal-plan",
    actionLabel: "📅 Plan Your Week",
    estimatedSeconds: 60,
    notes: [
      "Plan the entire week at once",
      "Balance nutrition across your meals",
      "Include variety to prevent boredom",
    ],
  },
  {
    id: 3,
    title: "Choose Efficient, Healthy Recipes",
    description: "Delicious AND quick recipes",
    longDescription:
      "Explore recipes that are both healthy and quick to prepare. Filter by cooking time and dietary preferences. You'll discover that healthy meals don't require hours in the kitchen—many take under 30 minutes.",
    icon: <BookOpen className="w-8 h-8 text-green-500" />,
    action: "navigate",
    actionTarget: "/recipes",
    actionLabel: "🥗 Find Quick Recipes",
    estimatedSeconds: 60,
    notes: [
      "Filter for recipes under 30 minutes",
      "Match your dietary goals",
      "Check nutrition information per serving",
    ],
  },
  {
    id: 4,
    title: "Understand Your Nutrition",
    description: "Make informed choices about your health",
    longDescription:
      "Every recipe shows detailed nutrition information. Use this to meet your health goals—whether that's balancing macros, hitting calorie targets, or ensuring enough vegetables. Knowledge is power.",
    icon: <Leaf className="w-8 h-8 text-emerald-500" />,
    action: "navigate",
    actionTarget: "/recipes",
    actionLabel: "📊 View Nutrition",
    estimatedSeconds: 45,
    notes: [
      "Track calories and macros if applicable",
      "Ensure variety in nutrients",
      "Balance throughout the week",
    ],
  },
  {
    id: 5,
    title: "Streamline Your Week",
    description: "Plan once, execute all week",
    longDescription:
      "With your meals planned, you've eliminated multiple decisions. Know exactly what you're eating when. This reduces stress, prevents impulse fast-food decisions, and frees mental energy for what matters.",
    icon: <Zap className="w-8 h-8 text-yellow-500" />,
    action: "navigate",
    actionTarget: "/meal-plan",
    actionLabel: "✨ Review Your Plan",
    estimatedSeconds: 45,
    notes: [
      "Keep your plan visible all week",
      "Prep ingredients in advance when possible",
      "Adjust on the fly if needed",
    ],
  },
  {
    id: 6,
    title: "Smart Shopping for Your Health",
    description: "Buy what you need, nothing more",
    longDescription:
      "Your meal plan generates a consolidated shopping list. Buy exactly what you need for the week. This reduces food waste, saves time in the store, and ensures you have ingredients for healthy meals.",
    icon: <ShoppingCart className="w-8 h-8 text-orange-500" />,
    action: "navigate",
    actionTarget: "/shopping",
    actionLabel: "🛒 Generate Shopping List",
    estimatedSeconds: 45,
    notes: [
      "Shop from your consolidated list",
      "Avoid impulse purchases",
      "Buy fresh ingredients for optimal health",
    ],
  },
  {
    id: 7,
    title: "Welcome to Your New Routine",
    description: "Healthier, happier, more efficient",
    longDescription:
      "You've unlocked the secret to a balanced lifestyle. More health, more time, less stress. Return to Secret Sauce each week to plan your next amazing meals. Your future self will thank you for starting this practice today.",
    icon: <Sparkles className="w-8 h-8 text-amber-500" />,
    action: "screenshot",
    actionLabel: "Start Your Journey",
    estimatedSeconds: 20,
  },
]

interface ElevateJourneyTutorialProps {
  onComplete?: () => void
}

export function ElevateJourneyTutorial({ onComplete }: ElevateJourneyTutorialProps) {
  const router = useRouter()

  const handleComplete = async () => {
    if (onComplete) {
      onComplete()
    } else {
      await fetch("/api/tutorial/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutorial_path: "health" }),
      })
      router.push("/dashboard")
    }
  }

  return (
    <TutorialContainer
      steps={elevateSteps}
      tutorialPath="health"
      onComplete={handleComplete}
    />
  )
}
