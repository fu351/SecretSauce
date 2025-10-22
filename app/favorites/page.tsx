"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Heart, ChefHat } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { RecipeCard } from "@/components/recipe-card"
import { DatabaseSetupNotice } from "@/components/database-setup-notice"

interface FavoriteRecipe {
  id: string
  title: string
  image_url: string
  rating_avg: number
  difficulty: string
  rating_count: number
  dietary_tags: string[]
  created_at: string
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { theme } = useTheme()

  const bgClass = theme === "dark" ? "bg-[#0a0a0a]" : "bg-gray-50"
  const textClass = theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
  const cardBgClass = theme === "dark" ? "bg-[#1a1a1a] border-[#e8dcc4]/10" : "bg-white"

  useEffect(() => {
    if (user) {
      fetchFavorites()
    } else {
      setLoading(false)
    }
  }, [user])

  const fetchFavorites = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from("recipe_favorites")
        .select(`
          recipes (
            id,
            title,
            image_url,
            rating_avg,
            difficulty,
            rating_count,
            dietary_tags,
            created_at
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (error) {
        console.warn("Database not set up yet:", error.message)
        setFavorites([])
        return
      }

      // Transform the data to flatten the recipes
      const favoriteRecipes = data?.map((item: any) => item.recipes).filter(Boolean) || []

      setFavorites(favoriteRecipes)
    } catch (error) {
      console.error("Error fetching favorites:", error)
      setFavorites([])
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className={`min-h-screen ${bgClass} flex items-center justify-center p-6`}>
        <Card className={`w-full max-w-md ${cardBgClass}`}>
          <CardContent className="p-6 text-center">
            <Heart className={`h-12 w-12 ${theme === "dark" ? "text-[#e8dcc4]/40" : "text-gray-400"} mx-auto mb-4`} />
            <h2 className={`text-2xl font-serif font-light ${textClass} mb-4`}>Sign In Required</h2>
            <p className={`${theme === "dark" ? "text-[#e8dcc4]/60" : "text-gray-600"} mb-6`}>
              Please sign in to view your favorite recipes
            </p>
            <div className="space-y-2">
              <Button asChild className="w-full">
                <Link href="/auth/signin">Sign In</Link>
              </Button>
              <Button variant="outline" asChild className="w-full bg-transparent">
                <Link href="/auth/signup">Create Account</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${bgClass} p-6`}>
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-3xl font-serif font-light ${textClass} mb-2`}>My Favorite Recipes</h1>
          <p className={theme === "dark" ? "text-[#e8dcc4]/60" : "text-gray-600"}>Your collection of saved recipes</p>
        </div>

        {favorites.length === 0 ? (
          <div className="space-y-6">
            <DatabaseSetupNotice />
            <Card>
              <CardContent className="p-12 text-center">
                <Heart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className={`text-lg font-medium ${textClass} mb-2`}>No favorite recipes yet</h3>
                <p className={`${theme === "dark" ? "text-[#e8dcc4]/60" : "text-gray-600"} mb-6`}>
                  Start exploring recipes and click the heart icon to save your favorites
                </p>
                <Button asChild>
                  <Link href="/recipes">
                    <ChefHat className="h-4 w-4 mr-2" />
                    Browse Recipes
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className={`${theme === "dark" ? "text-[#e8dcc4]/60" : "text-gray-600"}`}>
                You have {favorites.length} favorite recipe{favorites.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favorites.map((recipe) => (
                <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                  <RecipeCard
                    id={recipe.id}
                    title={recipe.title}
                    image={recipe.image_url || "/placeholder.svg?height=300&width=400"}
                    rating={recipe.rating_avg || 0}
                    difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
                    comments={recipe.rating_count || 0}
                    tags={recipe.dietary_tags || []}
                  />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
