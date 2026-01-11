"use client"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { MealTypeTag } from "@/lib/types"
import {
  Sunrise,
  Sun,
  Moon,
  Apple,
  Cake,
} from "lucide-react"

interface MealTypeTagDisplayProps {
  mealType: MealTypeTag
}

const mealTypeIcons: Record<MealTypeTag, React.ComponentType<any>> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack: Apple,
  dessert: Cake,
}

const mealTypeLabels: Record<MealTypeTag, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
}

/**
 * Read-only display of the meal type classification
 * Shows auto-detected meal category with time-of-day icon
 */
export function MealTypeTagDisplay({ mealType }: MealTypeTagDisplayProps) {
  const Icon = mealTypeIcons[mealType]

  return (
    <div>
      <Label className="text-sm font-medium text-muted-foreground">
        Meal Type (Auto-detected)
      </Label>
      <Badge
        variant="secondary"
        className="mt-2 bg-purple-100 text-purple-900 border-purple-300"
      >
        <Icon className="h-3 w-3 mr-1" />
        {mealTypeLabels[mealType]}
      </Badge>
    </div>
  )
}
