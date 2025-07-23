"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Star, MessageCircle, BarChart3, Heart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

interface RecipeCardProps {
  id: string
  title: string
  image: string
  rating: number
  difficulty: "Beginner" | "Intermediate" | "Advanced"
  comments: number
  tags: string[]
  issues?: number
}

export function RecipeCard({ id, title, image, rating, difficulty, comments, tags, issues }: RecipeCardProps) {
  const [isFavorited, setIsFavorited] = useState(false)
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    if (user) {
      checkIfFavorited()
    }
  }, [user, id])

  const checkIfFavorited = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from("recipe_favorites")
        .select("id")
        .eq("recipe_id", id)
        .eq("user_id", user.id)
        .single()

      setIsFavorited(!!data)
    } catch (error) {
      // Not favorited
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
        toast({
          title: "Added to favorites",
          description: "Recipe has been added to your favorites.",
        })
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
      case "Beginner":
        return "bg-green-100 text-green-800"
      case "Intermediate":
        return "bg-yellow-100 text-yellow-800"
      case "Advanced":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="relative group cursor-pointer">
      <div className="relative overflow-hidden rounded-2xl aspect-[4/3] bg-gray-200">
        <img
          src={image || "/placeholder.svg"}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Favorite button */}
        <div className="absolute top-4 right-4">
          <Button
            size="icon"
            variant="secondary"
            className={`bg-white/90 hover:bg-white ${isFavorited ? "text-red-500" : "text-gray-600"}`}
            onClick={toggleFavorite}
            disabled={loading}
          >
            <Heart className={`h-4 w-4 ${isFavorited ? "fill-current" : ""}`} />
          </Button>
        </div>

        {/* Content overlay */}
        <div className="absolute inset-0 p-6 flex flex-col justify-between">
          {/* Top tags */}
          <div className="flex flex-wrap gap-2 justify-end mr-12">
            {tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="bg-white/90 text-gray-800 hover:bg-white">
                {tag}
              </Badge>
            ))}
          </div>

          {/* Bottom content */}
          <div className="text-white">
            <h3 className="text-xl font-bold mb-3 leading-tight">{title}</h3>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold">{rating}</span>
                </div>

                <div className="flex items-center gap-1">
                  <MessageCircle className="h-4 w-4" />
                  <span>{comments} comments</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <Badge className={getDifficultyColor(difficulty)}>{difficulty}</Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Issues notification */}
        {issues && (
          <div className="absolute bottom-4 left-4">
            <Badge variant="destructive" className="bg-red-500">
              N {issues} Issues ✕
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
}
