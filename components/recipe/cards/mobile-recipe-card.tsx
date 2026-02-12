"use client"

import { useState } from "react"
import Image from "next/image"
import { Clock, Star, Plus, Check, Users, ChefHat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { formatDietaryTag } from "@/lib/tag-formatter"
import { Recipe } from "@/lib/types"

interface MobileRecipeCardProps {
  recipe: Recipe
  onAdd: (recipe: Recipe, servings: number) => void
  textClass?: string
  mutedTextClass?: string
  cardBgClass?: string
  theme?: "light" | "dark"
}

export function MobileRecipeCard({
  recipe,
  onAdd,
  textClass = "text-gray-900",
  mutedTextClass = "text-gray-600",
  cardBgClass = "bg-white",
  theme = "light",
}: MobileRecipeCardProps) {
  const [added, setAdded] = useState(false)

  const getTotalTime = (recipe: Recipe) => {
    return (recipe.prep_time || 0) + (recipe.cook_time || 0)
  }

  const getDifficultyColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case "beginner":
        return theme === "dark"
          ? "bg-green-500/20 text-green-400 border-green-500/30"
          : "bg-green-100 text-green-800 border-green-200"
      case "intermediate":
        return theme === "dark"
          ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
          : "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "advanced":
        return theme === "dark"
          ? "bg-red-500/20 text-red-400 border-red-500/30"
          : "bg-red-100 text-red-800 border-red-200"
      default:
        return theme === "dark"
          ? "bg-gray-500/20 text-gray-400 border-gray-500/30"
          : "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const handleAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setAdded(true)
    onAdd(recipe, recipe.servings || 1)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div
      className={`flex flex-col gap-3 p-3 rounded-xl border ${
        theme === "dark"
          ? "border-[#e8dcc4]/10 bg-[#2a2924] hover:bg-[#2f2e29]"
          : "border-gray-200 bg-white hover:bg-gray-50"
      } hover:shadow-lg transition-all duration-200`}
    >
      {/* Image and Title Row */}
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden group">
          <Image
            src={getRecipeImageUrl(recipe.content?.image_url) || "/placeholder.svg"}
            alt={recipe.title}
            fill
            sizes="96px"
            className="object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          {/* Title */}
          <div>
            <h3 className={`text-sm font-bold line-clamp-2 leading-tight mb-2 ${textClass}`}>
              {recipe.title}
            </h3>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              {getTotalTime(recipe) > 0 && (
                <div className={`flex items-center gap-1 ${mutedTextClass}`}>
                  <Clock className="h-3 w-3" />
                  <span>{getTotalTime(recipe)}m</span>
                </div>
              )}
              {recipe.rating_avg && (
                <div className={`flex items-center gap-1 ${mutedTextClass}`}>
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold">{recipe.rating_avg.toFixed(1)}</span>
                </div>
              )}
              {recipe.servings && (
                <div className={`flex items-center gap-1 ${mutedTextClass}`}>
                  <Users className="h-3 w-3" />
                  <span>{recipe.servings} servings</span>
                </div>
              )}
              {recipe.nutrition?.calories && (
                <div className={`flex items-center gap-1 ${mutedTextClass}`}>
                  <ChefHat className="h-3 w-3" />
                  <span>{recipe.nutrition.calories} cal</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tags Carousel and Button Row */}
      <div className="flex items-center gap-2">
        {/* Tags Carousel */}
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 pb-0.5">
            {/* Difficulty badge first */}
            {recipe.difficulty && (
              <Badge
                variant="secondary"
                className={`text-[9px] px-1.5 py-0 h-4 flex-shrink-0 ${getDifficultyColor(recipe.difficulty)}`}
              >
                {recipe.difficulty}
              </Badge>
            )}

            {/* Then other tags */}
            {recipe.tags?.map((tag, index) => (
              <Badge
                key={index}
                variant="secondary"
                className={`text-[9px] px-1.5 py-0 h-4 flex-shrink-0 ${
                  theme === "dark"
                    ? "bg-[#e8dcc4]/15 text-[#e8dcc4]/80 border-[#e8dcc4]/20"
                    : "bg-gray-100 text-gray-700 border-gray-200"
                }`}
              >
                {formatDietaryTag(tag)}
              </Badge>
            ))}
          </div>
        </div>

        {/* Add button */}
        <Button
          onClick={handleAdd}
          disabled={added}
          size="sm"
          className={`h-7 px-3 text-xs flex-shrink-0 ${
            added
              ? theme === "dark"
                ? "bg-green-600 hover:bg-green-600 text-white"
                : "bg-green-500 hover:bg-green-500 text-white"
              : theme === "dark"
                ? "bg-[#e8dcc4] hover:bg-[#d4c8b0] text-[#181813]"
                : "bg-orange-500 hover:bg-orange-600 text-white"
          }`}
        >
          {added ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Added
            </>
          ) : (
            <>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
