"use client"

import clsx from "clsx"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Utensils } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import type { NutritionFormInput } from "@/lib/types/recipe-form"

interface RecipeNutritionFormProps {
  nutrition: NutritionFormInput
  onChange: (field: string, value: string) => void
}

export function RecipeNutritionForm({ nutrition, onChange }: RecipeNutritionFormProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const sectionCardClass = clsx(
    "shadow-lg border rounded-2xl",
    isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0"
  )
  return (
    <Card className={sectionCardClass}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Utensils className="h-5 w-5" />
          Nutrition Information (Optional)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <Label htmlFor="calories">Calories</Label>
            <Input
              id="calories"
              type="number"
              value={nutrition.calories}
              onChange={(e) => onChange("calories", e.target.value)}
              placeholder="250"
            />
          </div>

          <div>
            <Label htmlFor="protein">Protein (g)</Label>
            <Input
              id="protein"
              type="number"
              value={nutrition.protein}
              onChange={(e) => onChange("protein", e.target.value)}
              placeholder="15"
            />
          </div>

          <div>
            <Label htmlFor="carbs">Carbs (g)</Label>
            <Input
              id="carbs"
              type="number"
              value={nutrition.carbs}
              onChange={(e) => onChange("carbs", e.target.value)}
              placeholder="30"
            />
          </div>

          <div>
            <Label htmlFor="fat">Fat (g)</Label>
            <Input
              id="fat"
              type="number"
              value={nutrition.fat}
              onChange={(e) => onChange("fat", e.target.value)}
              placeholder="10"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
