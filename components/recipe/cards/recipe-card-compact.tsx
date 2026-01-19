"use client"

import type React from "react"
import { useState, useEffect, memo } from "react"
import Image from "next/image"
import { Star, Heart } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { Recipe, RecipeTags } from "@/lib/types"
import { useDraggable } from "@dnd-kit/core"

interface DragData {
  recipe: Recipe
  source: 'modal' | 'slot'
  sourceMealType?: string
  sourceDate?: string
}

interface RecipeCardCompactProps extends Omit<Partial<Recipe>, 'tags'> {
  id: string
  title: string
  rating_avg: number
  difficulty: "beginner" | "intermediate" | "advanced"
  tags?: RecipeTags
  initialIsFavorited?: boolean
  skipFavoriteCheck?: boolean
  onFavoriteChange?: (id: string, isFavorited: boolean) => void
  showFavorite?: boolean
  isDragging?: boolean
  getDraggableProps?: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
}

function RecipeCardCompactComponent({
  id,
  title,
  content,
  rating_avg,
  difficulty,
  comments,
  tags,
  nutrition,
  initialIsFavorited,
  skipFavoriteCheck,
  onFavoriteChange,
  showFavorite = true,
  isDragging = false,
  getDraggableProps,
  ...rest
}: RecipeCardCompactProps) {
  const [isFavorited, setIsFavorited] = useState(!!initialIsFavorited)
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const { toast } = useToast()

  // Setup draggable if getDraggableProps is provided
  const recipe = { id, title, content, rating_avg, difficulty, comments, tags, nutrition, ...rest } as Recipe
  const draggableProps = getDraggableProps ? getDraggableProps(recipe, 'modal') : null
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: draggableProps?.draggableId || '',
    data: draggableProps?.data,
    disabled: !getDraggableProps,
  })

  useEffect(() => {
    if (user && !skipFavoriteCheck) {
      checkIfFavorited()
    }
  }, [user, id, skipFavoriteCheck])

  useEffect(() => {
    setIsFavorited(!!initialIsFavorited)
  }, [initialIsFavorited])

  const checkIfFavorited = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from("recipe_favorites")
        .select("id")
        .eq("recipe_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)

      if (error && error.code !== "PGRST116") {
        console.warn("Error checking favorites:", error)
        return
      }

      setIsFavorited(!!(data && data.length > 0))
    } catch (error) {
      console.warn("Error checking if favorited:", error)
      setIsFavorited(false)
    }
  }

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to favorite recipes.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      if (isFavorited) {
        const { error } = await supabase.from("recipe_favorites").delete().eq("recipe_id", id).eq("user_id", user.id)

        if (error) throw error
        setIsFavorited(false)
        onFavoriteChange?.(id, false)
      } else {
        const { error } = await supabase.from("recipe_favorites").insert({
          recipe_id: id,
          user_id: user.id,
        })

        if (error) throw error
        setIsFavorited(true)
        onFavoriteChange?.(id, true)
      }
    } catch (error) {
      console.error("Error toggling favorite:", error)
      toast({
        title: "Error",
        description: "Failed to update favorites.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case "beginner":
        return "text-green-600"
      case "intermediate":
        return "text-yellow-600"
      case "advanced":
        return "text-red-600"
      default:
        return "text-gray-600"
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`relative group transition-all duration-200 ${getDraggableProps ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${isDragging ? 'opacity-50' : ''} hover:shadow-md`}
      {...(getDraggableProps ? { ...attributes, ...listeners } : {})}
    >
      <div className="relative overflow-hidden rounded-lg bg-background border border-border/40">
        {/* Image Section */}
        <div className="relative aspect-[4/3] bg-muted">
          <Image
            src={getRecipeImageUrl(content?.image_url) || "/placeholder.svg"}
            alt={title}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover"
            priority={false}
            loading="lazy"
          />

          {/* Simple gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

          {/* Favorite button - cleaner, simpler */}
          {showFavorite && (
            <button
              onClick={toggleFavorite}
              disabled={loading}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background transition-colors z-10"
              data-favorite-button
            >
              <Heart
                className={`h-3.5 w-3.5 transition-colors ${
                  isFavorited
                    ? "fill-red-500 text-red-500"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              />
            </button>
          )}
        </div>

        {/* Content Section - Clean and compact */}
        <div className="p-2.5 space-y-1.5">
          {/* Title */}
          <h3 className="font-medium text-sm leading-tight line-clamp-2 text-foreground">
            {title}
          </h3>

          {/* Metadata row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-foreground">{rating_avg.toFixed(1)}</span>
            </div>

            <span className={`text-xs font-medium ${getDifficultyColor(difficulty)}`}>
              {difficulty}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export const RecipeCardCompact = memo(RecipeCardCompactComponent)
