"use client"

import { useState } from "react"
import Image from "next/image"
import { Star, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { QuantityControl } from "@/components/quantity-control"
import { getRecipeImageUrl } from "@/lib/image-helper"
import {Recipe} from "@/lib/types/recipe"

interface CompactRecipeCardProps {
  recipe: Recipe
  onAdd: (recipe: Recipe, servings: number) => void
  onPreview?: (recipeId: string) => void
  textClass?: string
  mutedTextClass?: string
  cardBgClass?: string
  theme?: "light" | "dark"
}

export function CompactRecipeCard({
  recipe,
  onAdd,
  onPreview,
  textClass = "text-gray-900",
  mutedTextClass = "text-gray-500",
  cardBgClass = "bg-white",
  theme = "light",
}: CompactRecipeCardProps) {
  const [servings, setServings] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [addingToCart, setAddingToCart] = useState(false)

  const handleServingsChange = (value: string) => {
    setEditingValue(value)
  }

  const handleServingsKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      const newValue = parseFloat(editingValue) || servings
      setServings(Math.max(0.5, newValue))
      setEditingId(null)
    } else if (e.key === "Escape") {
      setEditingId(null)
    }
  }

  const handleDecrement = () => {
    setServings((prev: number) => Math.max(0.5, prev - 1))
  }

  const handleIncrement = () => {
    setServings((prev: number) => prev + 1)
  }

  const handleAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setAddingToCart(true)
    try {
      onAdd(recipe, servings)
    } finally {
      setAddingToCart(false)
    }
  }

  const handlePreview = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (onPreview) {
      onPreview(recipe.id)
    }
  }

  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)

  return (
    <Card className={`border-0 shadow-sm hover:shadow-md transition-shadow w-full ${cardBgClass}`}>
      <CardContent className="p-2">
        <div className="flex flex-col gap-2">
          {/* Title */}
          <h4 className={`font-semibold text-sm line-clamp-2 break-words ${textClass}`}>
            {recipe.title}
          </h4>

          {/* Metadata row */}
          <div className="flex items-center gap-1 text-xs flex-wrap">
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

          {/* Controls */}
          <div className="flex gap-1.5 items-center">
            <QuantityControl
              quantity={servings}
              editingId={editingId}
              itemId={recipe.id}
              editingValue={editingValue}
              onQuantityChange={handleServingsChange}
              onQuantityKeyDown={handleServingsKeyDown}
              onDecrement={handleDecrement}
              onIncrement={handleIncrement}
              theme={theme}
              textClass={textClass}
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={addingToCart}
              className={`${
                theme === "dark"
                  ? "bg-[#e8dcc4] hover:bg-[#d4c8b0] text-[#181813]"
                  : "bg-orange-500 hover:bg-orange-600 text-white"
              } text-xs h-6 px-2 text-[11px] flex-1`}
            >
              Add
            </Button>
            {onPreview && (
              <Button
                size="sm"
                variant="outline"
                onClick={handlePreview}
                className={`${
                  theme === "dark"
                    ? "border border-[#e8dcc4]/20 bg-[#281f1a] hover:bg-[#2a2924] text-[#e8dcc4]"
                    : "border border-gray-200 bg-white hover:bg-gray-50 text-gray-900"
                } text-xs h-6 px-2 text-[11px]`}
              >
                Preview
              </Button>
            )}
          </div>

          {/* Image thumbnail */}
          <div className="relative w-full h-28 rounded-lg overflow-hidden bg-gray-200">
            <Image
              src={getRecipeImageUrl(recipe.image_url) || "/placeholder.svg"}
              alt={recipe.title}
              fill
              className="object-cover"
              sizes="100%"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
