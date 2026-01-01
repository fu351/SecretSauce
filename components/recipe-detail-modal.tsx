"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Star } from "lucide-react"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { useRecipe } from "@/hooks/use-recipe"
import { type Recipe } from "@/lib/types/recipe"
import { QuantityControl } from "@/components/quantity-control"

interface RecipeDetailModalProps {
  recipeId: string | null
  onClose: () => void
  onAddToCart: (recipe: Recipe, servings: number) => Promise<void>
  textClass?: string
  mutedTextClass?: string
  buttonClass?: string
  theme?: "light" | "dark"
  bgClass?: string
}

export function RecipeDetailModal({
  recipeId,
  onClose,
  onAddToCart,
  textClass = "text-gray-900",
  mutedTextClass = "text-gray-500",
  buttonClass = "bg-orange-500 hover:bg-orange-600 text-white",
  theme = "light",
  bgClass = "bg-white",
}: RecipeDetailModalProps) {
  const [servings, setServings] = useState(1)
  const [isAdding, setIsAdding] = useState(false)
  const { data: recipe, isLoading } = useRecipe(recipeId)

  const isOpen = !!recipeId

  const handleAddToCart = async () => {
    if (!recipe) return
    setIsAdding(true)
    try {
      await onAddToCart(recipe, servings)
      onClose()
    } finally {
      setIsAdding(false)
    }
  }

  const getDifficultyColor = (level?: string) => {
    const colors: Record<string, string> = {
      beginner: "bg-green-100 text-green-800",
      intermediate: "bg-yellow-100 text-yellow-800",
      advanced: "bg-red-100 text-red-800",
    }
    return colors[level?.toLowerCase() || ""] || "bg-gray-100 text-gray-800"
  }

  const totalTime = recipe ? (recipe.prep_time || 0) + (recipe.cook_time || 0) : 0

  if (!recipe && !isLoading) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-2xl max-h-[80vh] p-0 flex flex-col border-0 ${bgClass}`}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Hero Image */}
            {recipe.image_url && (
              <div className="relative h-48 w-full flex-shrink-0 overflow-hidden">
                <Image
                  src={getRecipeImageUrl(recipe.image_url) || "/placeholder.svg"}
                  alt={recipe.title}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-6 p-6">
                {/* Header */}
                <div className="space-y-2">
                  <DialogTitle className={`text-2xl font-bold ${textClass}`}>
                    {recipe.title}
                  </DialogTitle>
                  {recipe.description && (
                    <p className={`text-sm ${mutedTextClass}`}>{recipe.description}</p>
                  )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {totalTime > 0 && (
                    <StatCard
                      icon={<Clock className="h-4 w-4 text-orange-500" />}
                      label="Time"
                      value={`${totalTime}m`}
                      textClass={textClass}
                      mutedTextClass={mutedTextClass}
                    />
                  )}

                  {recipe.servings && (
                    <StatCard
                      icon={<Users className="h-4 w-4 text-orange-500" />}
                      label="Servings"
                      value={recipe.servings}
                      textClass={textClass}
                      mutedTextClass={mutedTextClass}
                    />
                  )}

                  {recipe.difficulty && (
                    <div className="flex flex-col gap-1">
                      <p className={`text-xs ${mutedTextClass}`}>Difficulty</p>
                      <Badge className={getDifficultyColor(recipe.difficulty)}>
                        {recipe.difficulty}
                      </Badge>
                    </div>
                  )}

                  {recipe.rating_avg && recipe.rating_avg > 0 && (
                    <StatCard
                      icon={<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
                      label="Rating"
                      value={recipe.rating_avg.toFixed(1)}
                      textClass={textClass}
                      mutedTextClass={mutedTextClass}
                    />
                  )}
                </div>

                {/* Nutrition */}
                {recipe.nutrition && Object.keys(recipe.nutrition).length > 0 && (
                  <div className={`space-y-3 border-t pt-6 ${theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"}`}>
                    <h3 className={`font-semibold ${textClass}`}>Nutrition per serving</h3>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {recipe.nutrition.calories && (
                        <NutritionCard
                          label="Calories"
                          value={recipe.nutrition.calories}
                          mutedTextClass={mutedTextClass}
                          theme={theme}
                          textClass={textClass}
                        />
                      )}
                      {recipe.nutrition.protein && (
                        <NutritionCard
                          label="Protein"
                          value={`${recipe.nutrition.protein}g`}
                          mutedTextClass={mutedTextClass}
                          theme={theme}
                          textClass={textClass}
                        />
                      )}
                      {recipe.nutrition.carbs && (
                        <NutritionCard
                          label="Carbs"
                          value={`${recipe.nutrition.carbs}g`}
                          mutedTextClass={mutedTextClass}
                          theme={theme}
                          textClass={textClass}
                        />
                      )}
                      {recipe.nutrition.fat && (
                        <NutritionCard
                          label="Fat"
                          value={`${recipe.nutrition.fat}g`}
                          mutedTextClass={mutedTextClass}
                          theme={theme}
                          textClass={textClass}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Ingredients */}
                {recipe.ingredients && recipe.ingredients.length > 0 && (
                  <div className={`space-y-3 border-t pt-6 ${theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"}`}>
                    <h3 className={`font-semibold ${textClass}`}>Ingredients</h3>
                    <ul className="space-y-2">
                      {recipe.ingredients.slice(0, 10).map((ingredient: any, idx: number) => (
                        <li key={idx} className={`flex gap-3 text-sm ${textClass}`}>
                          <span className="text-orange-500">•</span>
                          <span>
                            {ingredient.amount} {ingredient.unit} {ingredient.name}
                          </span>
                        </li>
                      ))}
                      {recipe.ingredients.length > 10 && (
                        <li className={`text-sm ${mutedTextClass}`}>
                          +{recipe.ingredients.length - 10} more ingredients
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className={`flex items-center gap-4 border-t pt-6 ${theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${mutedTextClass}`}>Servings:</span>
                    <QuantityControl
                      quantity={servings}
                      editingId={null}
                      itemId="servings"
                      editingValue={servings.toString()}
                      onQuantityChange={(val) => setServings(parseFloat(val))}
                      onQuantityKeyDown={() => {}}
                      onDecrement={() => setServings(Math.max(1, servings - 1))}
                      onIncrement={() => setServings(servings + 1)}
                      theme={theme}
                      textClass={textClass}
                    />
                  </div>
                  <div className="flex-1" />
                  <Button onClick={handleAddToCart} disabled={isAdding} className={buttonClass}>
                    {isAdding ? "Adding..." : "Add to List"}
                  </Button>
                </div>

                {/* Footer Link */}
                <div className="flex justify-center">
                  <Link
                    href={`/recipes/${recipe.id}`}
                    className="text-sm text-orange-500 hover:underline"
                  >
                    View full recipe
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  textClass: string
  mutedTextClass: string
}

function StatCard({ icon, label, value, textClass, mutedTextClass }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {icon}
        <span className={`text-xs ${mutedTextClass}`}>{label}</span>
      </div>
      <span className={`font-semibold text-sm ${textClass}`}>{value}</span>
    </div>
  )
}

interface NutritionCardProps {
  label: string
  value: string | number
  mutedTextClass: string
  theme?: "light" | "dark"
  textClass?: string
}

function NutritionCard({ label, value, mutedTextClass, theme = "light", textClass = "text-gray-900" }: NutritionCardProps) {
  return (
    <div className={`rounded p-2 text-center ${theme === "dark" ? "bg-[#281f1a]" : "bg-gray-100"}`}>
      <div className={`text-xs opacity-75 ${mutedTextClass}`}>{label}</div>
      <div className={`font-semibold ${textClass}`}>{value}</div>
    </div>
  )
}
