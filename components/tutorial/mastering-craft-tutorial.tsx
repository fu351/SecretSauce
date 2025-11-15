"use client"

import { BookOpen, ChefHat, Lightbulb, Clock, BarChart3, ShoppingCart, Sparkles } from "lucide-react"
import { TutorialContainer, TutorialStep } from "./tutorial-container"
import { useRouter } from "next/navigation"

const masterySteps: TutorialStep[] = [
  {
    id: 1,
    title: "Welcome to Your Culinary Journey",
    description: "Learn through discovery and practice",
    longDescription:
      "Secret Sauce is your personal culinary mentor. We'll guide you through discovering recipes that inspire you, understanding ingredients like a true chef, and building confidence in the kitchen.",
    icon: <ChefHat className="w-8 h-8 text-orange-500" />,
    action: "screenshot",
    actionLabel: "Let's Begin",
    estimatedSeconds: 20,
  },
  {
    id: 2,
    title: "Discover Recipes",
    description: "Find recipes that match your skill level",
    longDescription:
      "Start by browsing our curated recipe collection. Filter by difficulty level—we recommend beginning with 'Apprentice' level recipes to build your foundation before progressing to more complex dishes.",
    icon: <BookOpen className="w-8 h-8 text-blue-500" />,
    action: "navigate",
    actionTarget: "/recipes",
    actionLabel: "🔍 Explore Recipes",
    estimatedSeconds: 60,
    notes: [
      "Use filters to find recipes at your current skill level",
      "Read the full recipe before you start cooking",
      "Check prep and cook times to plan your day",
    ],
  },
  {
    id: 3,
    title: "Master the Instructions",
    description: "Learn step-by-step cooking techniques",
    longDescription:
      "Every recipe is broken down into clear, numbered steps. Read through the entire recipe first, gather all your ingredients (mise en place), and follow each instruction carefully. Each recipe teaches you valuable techniques.",
    icon: <Lightbulb className="w-8 h-8 text-yellow-500" />,
    action: "navigate",
    actionTarget: "/recipes",
    actionLabel: "👨‍🍳 View a Recipe",
    estimatedSeconds: 45,
    notes: [
      "Write down any unfamiliar techniques to practice",
      "Don't skip the preparation—it's crucial!",
      "Cook at your own pace; timing varies by kitchen",
    ],
  },
  {
    id: 4,
    title: "Plan Your Cooking Week",
    description: "Build consistency through meal planning",
    longDescription:
      "Consistency is the secret to skill development. Plan multiple recipes throughout your week. This helps you practice different techniques and build muscle memory. Start with 3-4 recipes and gradually expand.",
    icon: <Clock className="w-8 h-8 text-green-500" />,
    action: "navigate",
    actionTarget: "/meal-plan",
    actionLabel: "📅 Create a Meal Plan",
    estimatedSeconds: 60,
    notes: [
      "Mix easy and moderate recipes in your plan",
      "Plan similar cooking times for batch preparation",
      "Review your plan before shopping",
    ],
  },
  {
    id: 5,
    title: "Smart Ingredient Shopping",
    description: "Know what to buy and where to find value",
    longDescription:
      "Once you've planned your meals, create a consolidated shopping list. Understanding ingredients—their quality, seasonal availability, and proper storage—is crucial for culinary mastery. Our price comparison helps you make smart choices.",
    icon: <ShoppingCart className="w-8 h-8 text-red-500" />,
    action: "navigate",
    actionTarget: "/shopping",
    actionLabel: "🛒 Build Shopping List",
    estimatedSeconds: 45,
    notes: [
      "Quality ingredients make a huge difference",
      "Check expiry dates and storage instructions",
      "Buy seasonal produce for better flavor and value",
    ],
  },
  {
    id: 6,
    title: "Start Your First Cook",
    description: "Put your knowledge into practice",
    longDescription:
      "You're ready! Pick your first recipe, execute it with intention, and take note of what you learned. Every cook teaches you something. Don't worry about perfection—focus on following the process and enjoying the learning.",
    icon: <BarChart3 className="w-8 h-8 text-purple-500" />,
    action: "navigate",
    actionTarget: "/recipes",
    actionLabel: "👨‍🍳 Start Cooking",
    estimatedSeconds: 30,
    notes: [
      "Follow the recipe exactly the first time",
      "Note any improvements for next time",
      "Taste and adjust as you learn",
    ],
  },
  {
    id: 7,
    title: "You're On Your Way!",
    description: "Your culinary mastery begins now",
    longDescription:
      "Remember: Every master chef started where you are. Consistency, curiosity, and practice are your path to culinary excellence. Come back to Secret Sauce anytime you need inspiration or guidance. Happy cooking!",
    icon: <Sparkles className="w-8 h-8 text-amber-500" />,
    action: "screenshot",
    actionLabel: "Start Exploring",
    estimatedSeconds: 20,
  },
]

interface MasteringCraftTutorialProps {
  onComplete?: () => void
}

export function MasteringCraftTutorial({ onComplete }: MasteringCraftTutorialProps) {
  const router = useRouter()

  const handleComplete = async () => {
    if (onComplete) {
      onComplete()
    } else {
      await fetch("/api/tutorial/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutorial_path: "cooking" }),
      })
      router.push("/dashboard")
    }
  }

  return (
    <TutorialContainer
      steps={masterySteps}
      tutorialPath="cooking"
      onComplete={handleComplete}
    />
  )
}
