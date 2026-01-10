"use client"

import type React from "react"
import { useState, useEffect, memo } from "react"
import Image from "next/image"
import { Star, MessageCircle, BarChart3, Heart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { useRecipeDB } from "@/lib/database/recipe-db"
import { Recipe } from "@/lib/types/recipe"

interface RecipeCardProps extends Omit<Partial<Recipe>, 'tags'> {
  id: string
  title: string
  image_url: string
  rating_avg: number
  difficulty: "beginner" | "intermediate" | "advanced"
  comments: number
  tags?: string[]
  initialIsFavorited?: boolean
  skipFavoriteCheck?: boolean
  onFavoriteChange?: (id: string, isFavorited: boolean) => void
  showFavorite?: boolean
}

function RecipeCardComponent({
  id,
  title,
  image_url,
  rating_avg,
  difficulty,
  comments,
  tags,
  nutrition,
  initialIsFavorited,
  skipFavoriteCheck,
  onFavoriteChange,
  showFavorite = true,
}: RecipeCardProps) {
  const { updateRecipeRating } = useRecipeDB()
  const [isFavorited, setIsFavorited] = useState(!!initialIsFavorited)
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const { toast } = useToast()

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
        toast({
          title: "Removed from favorites",
          description: "Recipe has been removed from your favorites.",
        })
      } else {
        const { error } = await supabase.from("recipe_favorites").insert({
          recipe_id: id,
          user_id: user.id,
        })

        if (error) throw error
        setIsFavorited(true)
        onFavoriteChange?.(id, true)
        toast({
          title: "Added to favorites",
          description: "Recipe has been added to your favorites.",
        })
      }
    } catch (error) {
      console.error("Error toggling favorite:", error)
      toast({
        title: "Error",
        description: "Failed to update favorites. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const updateRating = async (newRating: number) => {
    try {
      const newCount = (rating_avg ? 1 : 0)
      await updateRecipeRating(id, newRating, newCount)
    } catch (error) {
      console.error("Error updating recipe rating:", error)
      toast({
        title: "Error",
        description: "Failed to update recipe rating.",
        variant: "destructive",
      })
    }
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

  return (
    <div className="relative group cursor-pointer">
      <div className="relative overflow-hidden rounded-2xl aspect-[4/3] bg-gray-200">
        <Image
          src={getRecipeImageUrl(image_url) || "/placeholder.svg"}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          priority={false}
          loading="lazy"
        />

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        </div>

        {showFavorite && (
          <div className="absolute top-2 md:top-4 right-2 md:right-4 z-20 pointer-events-auto">
            <Button
              size="icon"
              variant="secondary"
              className={`bg-white/90 hover:bg-white ${isFavorited ? "text-red-500" : "text-gray-600"} h-8 w-8 md:h-10 md:w-10`}
              onClick={toggleFavorite}
              disabled={loading}
              data-favorite-button
            >
              <Heart className={`h-3 w-3 md:h-4 md:w-4 ${isFavorited ? "fill-current" : ""}`} />
            </Button>
          </div>
        )}

        <div className="absolute inset-0 p-3 md:p-6 flex flex-col justify-between pointer-events-none">
          <div className="flex flex-wrap gap-1 md:gap-2 justify-end mr-10 md:mr-12">
            {tags &&
              Array.isArray(tags) &&
              tags.slice(0, 2).map((tag, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="bg-white/90 text-gray-800 hover:bg-white text-xs md:text-sm px-1.5 md:px-2 py-0.5 md:py-1"
                >
                  {tag}
                </Badge>
              ))}
          </div>

          <div className="text-white transition-all duration-300 pb-0 group-hover:pb-12 md:group-hover:pb-16 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            <h3 className="text-base md:text-xl font-bold mb-2 md:mb-3 leading-tight transition-transform duration-300 group-hover:-translate-y-2 line-clamp-2">
              {title}
            </h3>

            <div className="flex items-center justify-between text-xs md:text-sm">
              <div className="flex items-center gap-2 md:gap-4">
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 md:h-4 md:w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold">{rating_avg.toFixed(1)}</span>
                </div>

                <div className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">{comments} reviews</span>
                  <span className="sm:hidden">{comments}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 md:gap-2">
                <BarChart3 className="h-3 w-3 md:h-4 md:w-4" />
                <Badge className={`${getDifficultyColor(difficulty)} text-xs px-1.5 py-0.5`}>{difficulty}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none hidden md:block">
          <div className="m-3 rounded-xl bg-white/90 backdrop-blur-sm text-gray-800 p-4 shadow">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-gray-500">Calories</div>
                <div className="font-semibold">{nutrition?.calories ?? "—"}</div>
              </div>
              <div>
                <div className="text-gray-500">Protein</div>
                <div className="font-semibold">{nutrition?.protein ? `${nutrition.protein}g` : "—"}</div>
              </div>
              <div>
                <div className="text-gray-500">Fat</div>
                <div className="font-semibold">{nutrition?.fat ? `${nutrition.fat}g` : "—"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* issues field optional from Recipe extension */}
      </div>
    </div>
  )
}

export const RecipeCard = memo(RecipeCardComponent)
