"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { HeroSection } from "@/components/hero-section"
import { RecipeSection } from "@/components/recipe-section"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { ChefHat, Heart, Calendar, ShoppingCart, TrendingUp, Star, Clock, Users } from "lucide-react"

interface Ingredient {
  amount: string
  unit: string
  name: string
}

interface Recipe {
  id: string
  title: string
  description: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: string
  cuisine: string
  image_url: string
  tags: string[]
  ingredients: Ingredient[]
  instructions: string[]
  user_id: string
  created_at: string
}

interface PopularRecipe {
  id: string
  title: string
  image: string
  rating: number
  difficulty: "Beginner" | "Intermediate" | "Advanced"
  comments: number
  tags: string[]
}

// Add fallback recipes data before the component
const fallbackRecipes: PopularRecipe[] = [
  {
    id: "1",
    title: "Vegetarian Buddha Bowl",
    image: "/placeholder.svg?height=300&width=400",
    rating: 4.8,
    difficulty: "Beginner",
    comments: 24,
    tags: ["Vegetarian", "Healthy"],
  },
  {
    id: "2",
    title: "Classic Spaghetti Carbonara",
    image: "/placeholder.svg?height=300&width=400",
    rating: 4.7,
    difficulty: "Intermediate",
    comments: 18,
    tags: ["Italian", "Quick"],
  },
  {
    id: "3",
    title: "Chocolate Chip Cookies",
    image: "/placeholder.svg?height=300&width=400",
    rating: 4.9,
    difficulty: "Beginner",
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
        // Use fallback data when database isn't ready
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
      }))

      setPopularRecipes(formattedRecipes)
    } catch (error) {
      console.warn("Error fetching popular recipes, using fallback data:", error)
      // Use fallback data when there's any error
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
      {/* Hero Section */}
      <HeroSection />

      {/* User Dashboard Section (if logged in) */}
      {user && (
        <section className="py-16 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome back, {user.email?.split("@")[0]}!
              </h2>
              <p className="text-gray-600">Here's what's cooking in your kitchen</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Link href="/recipes">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6 flex flex-col items-center">
                    <ChefHat className="h-8 w-8 text-orange-500 mb-2" />
                    <p className="text-sm font-medium text-gray-600">My Recipes</p>
                    <p className="text-2xl font-bold text-gray-900">{userStats.totalRecipes}</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/favorites">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6 flex flex-col items-center">
                    <Heart className="h-8 w-8 text-red-500 mb-2" />
                    <p className="text-sm font-medium text-gray-600">Favorites</p>
                    <p className="text-2xl font-bold text-gray-900">{userStats.favoriteRecipes}</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/meal-planner">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6 flex flex-col items-center">
                    <Calendar className="h-8 w-8 text-blue-500 mb-2" />
                    <p className="text-sm font-medium text-gray-600">Meal Plans</p>
                    <p className="text-2xl font-bold text-gray-900">{userStats.mealPlansThisWeek}</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/pantry">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6 flex flex-col items-center">
                    <ShoppingCart className="h-8 w-8 text-green-500 mb-2" />
                    <p className="text-sm font-medium text-gray-600">Pantry Items</p>
                    <p className="text-2xl font-bold text-gray-900">{userStats.pantryItems}</p>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Link href="/recipes">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-orange-100 rounded-lg">
                        <ChefHat className="h-6 w-6 text-orange-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Browse Recipes</h3>
                        <p className="text-sm text-gray-600">Discover new dishes to cook</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/meal-planner">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-100 rounded-lg">
                        <Calendar className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Plan Meals</h3>
                        <p className="text-sm text-gray-600">Organize your weekly menu</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/recipes/upload">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-green-100 rounded-lg">
                        <TrendingUp className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Share Recipe</h3>
                        <p className="text-sm text-gray-600">Upload your own creation</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Popular Recipes Section */}
      <RecipeSection title="Popular Recipes" recipes={popularRecipes} />

      {/* CTA Section */}
      <section className="bg-orange-500 py-16 px-6">
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
