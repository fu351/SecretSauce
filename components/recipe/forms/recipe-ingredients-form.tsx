"use client"

import clsx from "clsx"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Plus, ShoppingCart } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import { IngredientInputRow } from "./ingredient-input-row"
import type { IngredientFormInput } from "@/lib/types/forms"

interface RecipeIngredientsFormProps {
  ingredients: IngredientFormInput[]
  showAmountAndUnit?: boolean
  onChange: (ingredients: IngredientFormInput[]) => void
}

export function RecipeIngredientsForm({ ingredients, showAmountAndUnit = true, onChange }: RecipeIngredientsFormProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const sectionCardClass = clsx(
    "shadow-lg border rounded-2xl",
    isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0"
  )

  const addIngredient = () => {
    onChange([...ingredients, { name: "", amount: "", unit: "" }])
  }

  const removeIngredient = (index: number) => {
    onChange(ingredients.filter((_, i) => i !== index))
  }

  const updateIngredient = (index: number, field: keyof IngredientFormInput, value: string) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  return (
    <Card className={sectionCardClass}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShoppingCart className="h-5 w-5" />
          Ingredients
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-2">
          {ingredients.map((ingredient, index) => (
            <IngredientInputRow
              key={index}
              ingredient={ingredient}
              index={index}
              canRemove={ingredients.length > 1}
              showAmountAndUnit={showAmountAndUnit}
              onChange={updateIngredient}
              onRemove={removeIngredient}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addIngredient}
            className="w-full mt-3"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Ingredient
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
