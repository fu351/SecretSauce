"use client"

import { useState } from "react"
import Image from "next/image"
import { Star, Clock, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getRecipeImageUrl } from "@/lib/image-helper"
import {Recipe} from "@/lib/types/recipe-base"

interface CompactRecipeCardProps {
  recipe: Recipe
  onAdd: (recipe: Recipe) => void
  onPreview: (recipeId: string) => void
  textClass?: string
  mutedTextClass?: string
  buttonClass?: string
  buttonOutlineClass?: string
}

export function CompactRecipeCard({
  recipe,
  onAdd,
  onPreview,
  textClass = "text-gray-900",
  mutedTextClass = "text-gray-500",
  buttonClass = "bg-orange-500 hover:bg-orange-600 text-white",
  buttonOutlineClass = "border border-gray-200 bg-white hover:bg-gray-50",
}: CompactRecipeCardProps) {
  const [addingToCart, setAddingToCart] = useState(false)

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setAddingToCart(true)
    try {
      await onAdd(recipe)
    } finally {
      setAddingToCart(false)
    }
  }

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation()
    onPreview(recipe.id)
  }

  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex gap-3">
          {/* Image thumbnail */}
          <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
            <Image
              src={getRecipeImageUrl(recipe.image_url) || "/placeholder.svg"}
              alt={recipe.title}
              fill
              className="object-cover"
              sizes="80px"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title */}
            <h4 className={`font-semibold text-sm line-clamp-2 ${textClass}`}>
              {recipe.title}
            </h4>

            {/* Metadata row */}
            <div className="flex items-center gap-1.5 text-xs mt-2 flex-wrap">
              {recipe.rating_avg !== undefined && recipe.rating_avg > 0 && (
                <>
                  <div className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{recipe.rating_avg.toFixed(1)}</span>
                  </div>
                  <span className={mutedTextClass}>•</span>
                </>
              )}

              {totalTime > 0 && (
                <>
                  <div className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    <span>{totalTime}min</span>
                  </div>
                  {recipe.cuisine && <span className={mutedTextClass}>•</span>}
                </>
              )}

              {recipe.cuisine && (
                <Badge
                  variant="secondary"
                  className="text-xs px-1.5 py-0 h-5 leading-5"
                >
                  {recipe.cuisine}
                </Badge>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={addingToCart}
                className={`${buttonClass} text-xs h-7 px-2`}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePreview}
                className={`${buttonOutlineClass} text-xs h-7 px-2`}
              >
                Preview
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
