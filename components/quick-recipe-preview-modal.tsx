"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Flame, Star } from "lucide-react"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { useRecipe } from "@/hooks/use-recipe"
import { type Recipe } from "@/lib/types/recipe-base"
import { QuantityControl } from "@/components/quantity-control"

interface QuickRecipePreviewModalProps {
  recipeId: string | null
  onClose: () => void
  onAddToCart: (recipe: Recipe, servings: number) => Promise<void>
  textClass?: string
  mutedTextClass?: string
  buttonClass?: string
}

export function QuickRecipePreviewModal({
  recipeId,
  onClose,
  onAddToCart,
  textClass = "text-gray-900",
  mutedTextClass = "text-gray-500",
  buttonClass = "bg-orange-500 hover:bg-orange-600 text-white",
}: QuickRecipePreviewModalProps) {
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
    switch (level) {
      case "beginner":
        return "bg-green-100 text-green-800"
      case "intermediate":
        return "bg-yellow-100 text-yellow-800"
      case "advanced":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500"></div>
          </div>
        ) : recipe ? (
          <>
            {/* Recipe image */}
            {recipe.image_url && (
              <div className="relative w-full h-64 -mx-6 -mt-6 rounded-t-lg overflow-hidden">
                <Image
                  src={getRecipeImageUrl(recipe.image_url) || "/placeholder.svg"}
                  alt={recipe.title}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            )}

            {/* Title and metadata */}
            <div className="space-y-3">
              <div className="space-y-1">
                <DialogTitle className={`text-2xl ${textClass}`}>
                  {recipe.title}
                </DialogTitle>
                <DialogDescription className={mutedTextClass}>
                  {recipe.description}
                </DialogDescription>
              </div>

              {/* Quick stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Time */}
                {((recipe.prep_time || 0) + (recipe.cook_time || 0)) > 0 && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <div>
                      <div className={`text-xs ${mutedTextClass}`}>Time</div>
                      <div className={`font-semibold text-sm ${textClass}`}>
                        {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m
                      </div>
                    </div>
                  </div>
                )}

                {/* Servings */}
                {recipe.servings && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-orange-500" />
                    <div>
                      <div className={`text-xs ${mutedTextClass}`}>Servings</div>
                      <div className={`font-semibold text-sm ${textClass}`}>
                        {recipe.servings}
                      </div>
                    </div>
                  </div>
                )}

                {/* Difficulty */}
                {recipe.difficulty && (
                  <div className="flex items-center gap-2">
                    <div>
                      <div className={`text-xs ${mutedTextClass}`}>Difficulty</div>
                      <Badge className={getDifficultyColor(recipe.difficulty)}>
                        {recipe.difficulty}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Rating */}
                {recipe.rating_avg && recipe.rating_avg > 0 && (
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <div>
                      <div className={`text-xs ${mutedTextClass}`}>Rating</div>
                      <div className={`font-semibold text-sm ${textClass}`}>
                        {recipe.rating_avg.toFixed(1)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Nutrition info */}
              {recipe.nutrition && Object.keys(recipe.nutrition).length > 0 && (
                <div className="space-y-2">
                  <h3 className={`font-semibold text-sm ${textClass}`}>
                    Nutrition (per serving)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {recipe.nutrition.calories && (
                      <div className={`text-sm p-2 rounded ${mutedTextClass}`}>
                        <div className="text-xs opacity-70">Calories</div>
                        <div className="font-semibold">{recipe.nutrition.calories}</div>
                      </div>
                    )}
                    {recipe.nutrition.protein && (
                      <div className={`text-sm p-2 rounded ${mutedTextClass}`}>
                        <div className="text-xs opacity-70">Protein</div>
                        <div className="font-semibold">
                          {recipe.nutrition.protein}g
                        </div>
                      </div>
                    )}
                    {recipe.nutrition.carbs && (
                      <div className={`text-sm p-2 rounded ${mutedTextClass}`}>
                        <div className="text-xs opacity-70">Carbs</div>
                        <div className="font-semibold">{recipe.nutrition.carbs}g</div>
                      </div>
                    )}
                    {recipe.nutrition.fat && (
                      <div className={`text-sm p-2 rounded ${mutedTextClass}`}>
                        <div className="text-xs opacity-70">Fat</div>
                        <div className="font-semibold">{recipe.nutrition.fat}g</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Ingredients */}
              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <div className="space-y-2">
                  <h3 className={`font-semibold text-sm ${textClass}`}>
                    Ingredients
                  </h3>
                  <ul className={`space-y-2 text-sm ${textClass}`}>
                    {recipe.ingredients.slice(0, 10).map((ingredient: any, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-orange-500 mt-0.5">•</span>
                        <span>
                          {ingredient.amount} {ingredient.unit} {ingredient.name}
                        </span>
                      </li>
                    ))}
                    {recipe.ingredients.length > 10 && (
                      <li className={mutedTextClass}>
                        +{recipe.ingredients.length - 10} more ingredients
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Action section */}
              <div className="flex items-center gap-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${mutedTextClass}`}>Servings:</span>
                  <QuantityControl
                    quantity={servings}
                    onQuantityChange={setServings}
                    min={1}
                    max={20}
                  />
                </div>
                <div className="flex-1"></div>
                <Button
                  onClick={handleAddToCart}
                  disabled={isAdding}
                  className={buttonClass}
                >
                  {isAdding ? "Adding..." : "Add to Shopping List"}
                </Button>
              </div>

              {/* View full recipe link */}
              <div className="text-center">
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="text-sm text-orange-500 hover:underline"
                >
                  View full recipe
                </Link>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
