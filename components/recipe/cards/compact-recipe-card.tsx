"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Clock, Users, ChefHat, BarChart3, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { QuantityControl } from "@/components/shared/quantity-control"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { formatDietaryTag } from "@/lib/tag-formatter"
import { Recipe } from "@/lib/types"
import { useDraggable } from "@dnd-kit/core"

interface DragData {
  recipe: Recipe
  source: 'modal' | 'slot'
  sourceMealType?: string
  sourceDate?: string
}

interface CompactRecipeCardProps {
  recipe: Recipe
  onAdd: (recipe: Recipe, servings: number) => void
  textClass?: string
  mutedTextClass?: string
  cardBgClass?: string
  theme?: "light" | "dark"
  getDraggableProps?: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  onClick?: (recipe: Recipe) => void
  simplified?: boolean
  isDragging?: boolean
}

export function CompactRecipeCard({
  recipe,
  onAdd,
  textClass = "text-gray-900",
  mutedTextClass = "text-gray-600",
  cardBgClass = "bg-white/80",
  theme = "light",
  getDraggableProps,
  onClick,
  simplified = false,
  isDragging = false,
}: CompactRecipeCardProps) {
  const [servings, setServings] = useState(recipe.servings || 1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [addingToCart, setAddingToCart] = useState(false)

  // Setup draggable if getDraggableProps is provided
  const draggableProps = getDraggableProps ? getDraggableProps(recipe, 'modal') : null
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: draggableProps?.draggableId || '',
    data: draggableProps?.data,
    disabled: !getDraggableProps,
  })

  const handleServingsChange = (value: string) => {
    setEditingValue(value)
  }

  const handleServingsKeyDown = (e: React.KeyboardEvent) => {
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


  const getTotalTime = (recipe: Recipe) => {
    return (recipe.prep_time || 0) + (recipe.cook_time || 0)
  }

  const getDifficultyColor = (level: string) => {
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

  const handleCardClick = () => {
    onClick?.(recipe)
  }

  return (
    <Card
      ref={setNodeRef}
      onClick={handleCardClick}
      className={`group w-full ${getDraggableProps ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} hover:shadow-xl transition-all duration-300 backdrop-blur-sm border-0 shadow-lg overflow-hidden ${cardBgClass} ${isDragging ? "opacity-50" : ""}`}
      {...(getDraggableProps ? { ...attributes, ...listeners } : {})}
    >
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          {/* Image */}
          <div className="w-full lg:w-1/3 relative min-h-[250px] lg:min-h-[300px]">
            <Image
              src={getRecipeImageUrl(recipe.content?.image_url) || "/placeholder.svg"}
              alt={recipe.title}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover"
              loading="lazy"
            />
          </div>

          {/* Content */}
          <div className="w-full lg:w-2/3 p-6 flex flex-col justify-between">
            <div>
              {/* Title and difficulty */}
              <div className="flex items-start justify-between mb-3 gap-3">
                <h3 className={`text-xl font-bold group-hover:text-orange-600 transition-colors ${textClass}`}>
                  {recipe.title}
                </h3>
                <Badge className={getDifficultyColor(recipe.difficulty)}>
                  {recipe.difficulty}
                </Badge>
              </div>

              {/* Description */}
              {recipe.description && (
                <p className={`mb-4 line-clamp-2 text-sm ${mutedTextClass}`}>
                  {recipe.description}
                </p>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Total Time */}
                <div className="flex items-center gap-2">
                  <Clock
                    className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`}
                  />
                  <div>
                    <p className={`text-xs ${mutedTextClass}`}>Total Time</p>
                    <p className={`font-semibold text-sm ${textClass}`}>
                      {getTotalTime(recipe)} min
                    </p>
                  </div>
                </div>

                {/* Servings */}
                <div className="flex items-center gap-2">
                  <Users
                    className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`}
                  />
                  <div>
                    <p className={`text-xs ${mutedTextClass}`}>Servings</p>
                    <p className={`font-semibold text-sm ${textClass}`}>
                      {recipe.servings || 1}
                    </p>
                  </div>
                </div>

                {/* Nutrition */}
                {recipe.nutrition && (
                  <div className="flex items-center gap-2">
                    <ChefHat
                      className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`}
                    />
                    <div>
                      <p className={`text-xs ${mutedTextClass}`}>Calories</p>
                      <p className={`font-semibold text-sm ${textClass}`}>
                        {recipe.nutrition.calories || 0}
                      </p>
                    </div>
                  </div>
                )}

                {/* Rating */}
                <div className="flex items-center gap-2">
                  <BarChart3
                    className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`}
                  />
                  <div>
                    <p className={`text-xs ${mutedTextClass}`}>Rating</p>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className={`font-semibold text-sm ${textClass}`}>
                        {(recipe.rating_avg || 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {recipe.tags?.dietary && recipe.tags.dietary.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {recipe.tags.dietary.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className={
                        theme === "dark"
                          ? "bg-[#e8dcc4]/20 text-[#e8dcc4] text-xs"
                          : "bg-gray-100 text-gray-700 text-xs"
                      }
                    >
                      {formatDietaryTag(tag)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            {!simplified && (
              <div className="flex gap-2 items-stretch">
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
                  onClick={handleAdd}
                  disabled={addingToCart}
                  className={`${
                    theme === "dark"
                      ? "bg-[#e8dcc4] hover:bg-[#d4c8b0] text-[#181813]"
                      : "bg-orange-500 hover:bg-orange-600 text-white"
                  } flex-1`}
                >
                  Add
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className={`${
                    theme === "dark"
                      ? "border border-[#e8dcc4]/20 bg-[#281f1a] hover:bg-[#2a2924] text-[#e8dcc4]"
                      : "border border-gray-200 bg-white hover:bg-gray-50 text-gray-900"
                  }`}
                >
                  <Link href={`/recipes/${recipe.id}`}>
                    View Recipe
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
