"use client"

import type React from "react"
import { useState, useEffect, memo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, Users, Heart } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

interface Recipe {
  id: string
  title: string
  description: string
  image_url: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: string
  cuisine_type?: string
  dietary_tags: string[]
  rating_avg?: number
  rating_count?: number
}

interface RecipeCardProps {
  recipe: Recipe
  isFavorite?: boolean
  onFavoriteToggle?: () => void
}

function RecipeCardComponent({ recipe, isFavorite: initialIsFavorite = false, onFavoriteToggle }: RecipeCardProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite)
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false)

  useEffect(() => {
    if (user && recipe?.id) {
      checkIfFavorite()
    }
  }, [user, recipe?.id])

  const checkIfFavorite = async () => {
    if (!user || !recipe?.id) return

    try {
      const { data, error } = await supabase
        .from("recipe_favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("recipe_id", recipe.id)
        .maybeSingle()

      if (error) {
        console.error("Error checking favorite:", error)
        return
      }

      setIsFavorite(!!data)
    } catch (error) {
      console.error("Error checking if favorited:", error)
    }
  }

  const handleFavoriteClick = async (e: React.MouseEvent) => {
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

    if (!recipe?.id) {
      console.error("Recipe ID is missing")
      return
    }

    setIsTogglingFavorite(true)
    try {
      if (isFavorite) {
        const { error } = await supabase
          .from("recipe_favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("recipe_id", recipe.id)

        if (error) throw error
        setIsFavorite(false)
        toast({
          title: "Removed from favorites",
          description: "Recipe has been removed from your favorites.",
        })
      } else {
        const { error } = await supabase.from("recipe_favorites").insert({
          user_id: user.id,
          recipe_id: recipe.id,
        })

        if (error) throw error
        setIsFavorite(true)
        toast({
          title: "Added to favorites",
          description: "Recipe has been added to your favorites.",
        })
      }
      onFavoriteToggle?.()
    } catch (error) {
      console.error("Error toggling favorite:", error)
      toast({
        title: "Error",
        description: "Failed to update favorites. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsTogglingFavorite(false)
    }
  }

  if (!recipe) {
    return null
  }

  return (
    <Link href={`/recipes/${recipe.id}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer h-full">
        <div className="relative h-48 w-full">
          <img src={recipe.image_url || "/placeholder.svg"} alt={recipe.title} className="w-full h-full object-cover" />
          <div className="absolute top-2 right-2 flex gap-2">
            <Badge variant="secondary" className="bg-white/90">
              {recipe.difficulty}
            </Badge>
            {user && (
              <Button
                size="sm"
                variant="secondary"
                className={`h-8 w-8 p-0 rounded-full ${
                  isFavorite ? "bg-red-50 hover:bg-red-100" : "bg-white/90 hover:bg-white"
                }`}
                onClick={handleFavoriteClick}
                disabled={isTogglingFavorite}
              >
                <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
              </Button>
            )}
          </div>
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg mb-2 line-clamp-1">{recipe.title}</h3>
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">{recipe.description}</p>

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{recipe.prep_time + recipe.cook_time} min</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{recipe.servings} servings</span>
            </div>
          </div>

          {recipe.dietary_tags && recipe.dietary_tags.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {recipe.dietary_tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

export const RecipeCard = memo(RecipeCardComponent)
