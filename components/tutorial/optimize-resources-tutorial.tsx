"use client"

import { ShoppingCart, DollarSign, TrendingDown, BookOpen, BarChart3, Zap, Sparkles } from "lucide-react"
import { TutorialContainer, TutorialStep } from "./tutorial-container"
import { useRouter } from "next/navigation"

const optimizeSteps: TutorialStep[] = [
  {
    id: 1,
    title: "Control Your Food Budget",
    description: "Smart shopping starts with smart planning",
    longDescription:
      "Welcome! Secret Sauce helps you stretch your food budget without compromising quality. By building smart shopping lists and comparing prices across stores, you'll discover how much you can save every month.",
    icon: <DollarSign className="w-8 h-8 text-green-500" />,
    action: "screenshot",
    actionLabel: "Let's Save Money",
    estimatedSeconds: 20,
  },
  {
    id: 2,
    title: "Create Your Shopping List",
    description: "Take control of your purchases",
    longDescription:
      "Start by creating a shopping list. Add the items you need, quantities, and our system will show you prices across different stores. This gives you complete control and visibility over your spending.",
    icon: <ShoppingCart className="w-8 h-8 text-blue-500" />,
    action: "navigate",
    actionTarget: "/shopping",
    actionLabel: "🛒 Build a List",
    estimatedSeconds: 60,
    notes: [
      "Add items you actually need first",
      "Include quantities for accurate totals",
      "Review your list before shopping",
    ],
  },
  {
    id: 3,
    title: "Compare Prices Across Stores",
    description: "Find the best deals automatically",
    longDescription:
      "Once you've built your list, we show you prices at different stores. Compare total costs per store to find where you'll save the most. Some stores are cheaper for specific items—we help you find the best combination.",
    icon: <TrendingDown className="w-8 h-8 text-red-500" />,
    action: "navigate",
    actionTarget: "/shopping",
    actionLabel: "💰 Compare Prices",
    estimatedSeconds: 45,
    notes: [
      "Note which stores have the best overall prices",
      "Some items are cheaper at different stores",
      "Factor in store loyalty programs",
    ],
  },
  {
    id: 4,
    title: "Discover Budget-Friendly Recipes",
    description: "High quality doesn't mean high cost",
    longDescription:
      "Explore recipes filtered for budget ingredients. These dishes use affordable, quality ingredients without sacrificing flavor or nutrition. Many of the best meals are the most budget-friendly.",
    icon: <BookOpen className="w-8 h-8 text-orange-500" />,
    action: "navigate",
    actionTarget: "/recipes",
    actionLabel: "🍽️ Find Budget Recipes",
    estimatedSeconds: 60,
    notes: [
      "Filter recipes by your budget range",
      "Look for recipes with repeated ingredients",
      "Batch similar cooking techniques",
    ],
  },
  {
    id: 5,
    title: "Plan Your Week for Savings",
    description: "Bulk buying + smart planning = savings",
    longDescription:
      "Plan multiple meals using overlapping ingredients. When you buy ingredients that appear in multiple recipes, you reduce waste and maximize savings. A week of thoughtful planning can save significantly.",
    icon: <BarChart3 className="w-8 h-8 text-purple-500" />,
    action: "navigate",
    actionTarget: "/meal-plan",
    actionLabel: "📅 Plan for Savings",
    estimatedSeconds: 60,
    notes: [
      "Use ingredients across multiple recipes",
      "Buy larger quantities at better unit prices",
      "Minimize food waste through smart planning",
    ],
  },
  {
    id: 6,
    title: "Consolidate & Shop Smart",
    description: "One plan, maximum savings",
    longDescription:
      "Your meal plan automatically generates a consolidated shopping list with the best prices. Buy once, eat well all week. This approach eliminates impulse purchases and reduces total spending.",
    icon: <Zap className="w-8 h-8 text-yellow-500" />,
    action: "navigate",
    actionTarget: "/shopping",
    actionLabel: "🎯 Smart Shopping",
    estimatedSeconds: 45,
    notes: [
      "Stick to your consolidated list",
      "Avoid impulse purchases",
      "Check unit prices, not total prices",
    ],
  },
  {
    id: 7,
    title: "Track Your Savings",
    description: "Watch your budget grow",
    longDescription:
      "You've just learned the Secret Sauce method for budget optimization. Track your monthly spending, set savings goals, and watch how strategic planning compounds your savings. Every week, you're saving more.",
    icon: <Sparkles className="w-8 h-8 text-amber-500" />,
    action: "screenshot",
    actionLabel: "Start Saving",
    estimatedSeconds: 20,
  },
]

interface OptimizeResourcesTutorialProps {
  onComplete?: () => void
}

export function OptimizeResourcesTutorial({ onComplete }: OptimizeResourcesTutorialProps) {
  const router = useRouter()

  const handleComplete = async () => {
    if (onComplete) {
      onComplete()
    } else {
      await fetch("/api/tutorial/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutorial_path: "budgeting" }),
      })
      router.push("/dashboard")
    }
  }

  return (
    <TutorialContainer
      steps={optimizeSteps}
      tutorialPath="budgeting"
      onComplete={handleComplete}
    />
  )
}
