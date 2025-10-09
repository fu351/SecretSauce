"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { HeroSection } from "@/components/hero-section"
import { RecipeSection } from "@/components/recipe-section"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { ChefHat, Heart, Calendar, ShoppingCart } from "lucide-react"

interface PopularRecipe {
  id: string
  title: string
  image: string
  rating: number
  difficulty: "beginner" | "intermediate" | "advanced"
  comments: number
  tags: string[]
  nutrition?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  }
}

const fallbackRecipes: PopularRecipe[] = [
  {
    id: "1",
    title: "Vegetarian Buddha Bowl",
    image: "/placeholder.svg?height=300&width=400",
    rating: 4.8,
    difficulty: "beginner",
    comments: 24,
    tags: ["Vegetarian", "Healthy"],
  },
  {
    id: "2",
    title: "Classic Spaghetti Carbonara",
    image: "/placeholder.svg?height=300&width=400",
    rating: 4.7,
    difficulty: "intermediate",
    comments: 18,
    tags: ["Italian", "Quick"],
  },
  {
    id: "3",
    title: "Chocolate Chip Cookies",
    image: "/placeholder.svg?height=300&width=400",
    rating: 4.9,
    difficulty: "beginner",
    comments: 32,
    tags: ["Dessert", "Kid-Friendly"],
  },
]

export default function HomePage() {
  const [popularRecipes, setPopularRecipes] = useState<PopularRecipe[]>([])
  const [userStats, setUserStats] = useState({
    totalRecipes: 0,
    favoriteRecipes: 0,
    mealPlansThisWeek: 0,
    pantryItems: 0,
  })
  const { user, loading } = useAuth()

  useEffect(() => {
    fetchPopularRecipes()
    if (user) {
      fetchUserStats()
    }
  }, [user])

  const fetchPopularRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .order("rating_avg", { ascending: false })
        .limit(3)

      if (error) {
        console.warn("Database not set up yet, using fallback data:", error.message)
        setPopularRecipes(fallbackRecipes)
        return
      }

      const formattedRecipes = data.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        image: recipe.image_url,
        rating: recipe.rating_avg || 0,
        difficulty: recipe.difficulty,
        comments: recipe.rating_count || 0,
        tags: recipe.dietary_tags || [],
        nutrition: recipe.nutrition || undefined,
      }))

      setPopularRecipes(formattedRecipes)
    } catch (error) {
      console.warn("Error fetching popular recipes, using fallback data:", error)
      setPopularRecipes(fallbackRecipes)
    }
  }

  const fetchUserStats = async () => {
    if (!user) return

    try {
      const [recipesResult, favoritesResult, mealPlansResult, pantryResult] = await Promise.all([
        supabase.from("recipes").select("id", { count: "exact" }).eq("author_id", user.id),
        supabase.from("recipe_favorites").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase
          .from("meal_plans")
          .select("id", { count: "exact" })
          .eq("user_id", user.id)
          .gte("week_start", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
        supabase.from("pantry_items").select("id", { count: "exact" }).eq("user_id", user.id),
      ])

      setUserStats({
        totalRecipes: recipesResult.count || 0,
        favoriteRecipes: favoritesResult.count || 0,
        mealPlansThisWeek: mealPlansResult.count || 0,
        pantryItems: pantryResult.count || 0,
      })
    } catch (error) {
      console.error("Error fetching user stats:", error)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
      <HeroSection />

      {user && (
        <section className="py-16 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {user.email?.split("@")[0]}!</h2>
              <p className="text-gray-600">Here's what's cooking in your kitchen</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Link href="/recipes" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-white border-0 shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <ChefHat className="h-8 w-8 text-orange-500" />
                      <span className="text-xs text-gray-500">Your Recipes</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{userStats.totalRecipes}</p>
                    <p className="text-sm text-gray-500 mt-1">Recipes created</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/favorites" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-white border-0 shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <Heart className="h-8 w-8 text-red-500" />
                      <span className="text-xs text-gray-500">Favorites</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{userStats.favoriteRecipes}</p>
                    <p className="text-sm text-gray-500 mt-1">Saved recipes</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/meal-planner" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-white border-0 shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <Calendar className="h-8 w-8 text-blue-500" />
                      <span className="text-xs text-gray-500">Meal Plans</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{userStats.mealPlansThisWeek}</p>
                    <p className="text-sm text-gray-500 mt-1">Meals this week</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/pantry" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-white border-0 shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <ShoppingCart className="h-8 w-8 text-green-500" />
                      <span className="text-xs text-gray-500">Pantry Items</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{userStats.pantryItems}</p>
                    <p className="text-sm text-gray-500 mt-1">Items in stock</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </section>
      )}

      <RecipeSection title="Popular Recipes" recipes={popularRecipes} />

      <section className="bg-gradient-to-r from-orange-500 to-orange-600 py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to start your culinary journey?</h2>
          <p className="text-xl text-orange-100 mb-8">Join thousands of home cooks saving money and eating better</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {!user ? (
              <>
                <Button size="lg" variant="secondary" asChild>
                  <Link href="/auth/signup">Get Started Free</Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white text-white hover:bg-white hover:text-orange-500 bg-transparent"
                  asChild
                >
                  <Link href="/recipes">Browse Recipes</Link>
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" variant="secondary" asChild>
                  <Link href="/recipes">Browse Recipes</Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white text-white hover:bg-white hover:text-orange-500 bg-transparent"
                  asChild
                >
                  <Link href="/meal-planner">Plan Meals</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
