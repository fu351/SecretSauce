"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, TrendingUp, ChefHat, ShoppingCart, Heart } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { RecipeCard } from "@/components/recipe-card"

interface DashboardStats {
  totalRecipes: number
  favoriteRecipes: number
  mealPlansThisWeek: number
  pantryItems: number
}

interface RecentRecipe {
  id: string
  title: string
  image_url: string
  rating_avg: number
  difficulty: string
  rating_count: number
  dietary_tags: string[]
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRecipes: 0,
    favoriteRecipes: 0,
    mealPlansThisWeek: 0,
    pantryItems: 0,
  })
  const [recentRecipes, setRecentRecipes] = useState<RecentRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const { user, profile } = useAuth()

  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user])

  const fetchDashboardData = async () => {
    if (!user) return

    try {
      // Fetch stats
      const [recipesResult, favoritesResult, mealPlansResult, pantryResult, recentRecipesResult] = await Promise.all([
        supabase.from("recipes").select("id", { count: "exact" }).eq("author_id", user.id),
        supabase.from("recipe_favorites").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase
          .from("meal_plans")
          .select("id", { count: "exact" })
          .eq("user_id", user.id)
          .gte("week_start", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
        supabase.from("pantry_items").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase
          .from("recipes")
          .select("id, title, image_url, rating_avg, difficulty, rating_count, dietary_tags")
          .order("created_at", { ascending: false })
          .limit(6),
      ])

      setStats({
        totalRecipes: recipesResult.count || 0,
        favoriteRecipes: favoritesResult.count || 0,
        mealPlansThisWeek: mealPlansResult.count || 0,
        pantryItems: pantryResult.count || 0,
      })

      setRecentRecipes(recentRecipesResult.data || [])
    } catch (error) {
      console.error("Error fetching dashboard data:", error)
      // Set default values if database isn't set up
      setStats({
        totalRecipes: 0,
        favoriteRecipes: 0,
        mealPlansThisWeek: 0,
        pantryItems: 0,
      })
      setRecentRecipes([])
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Welcome to Secret Sauce</h2>
            <p className="text-gray-600 mb-6">Please sign in to access your dashboard</p>
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
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {profile?.full_name || user.email?.split("@")[0]}!
          </h1>
          <p className="text-gray-600">Here's what's cooking in your kitchen</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Link href="/recipes">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardContent className="p-6 flex flex-col items-center">
                <ChefHat className="h-8 w-8 text-orange-500 mb-2" />
                <p className="text-sm font-medium text-gray-600">My Recipes</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalRecipes}</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/favorites">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardContent className="p-6 flex flex-col items-center">
                <Heart className="h-8 w-8 text-red-500 mb-2" />
                <p className="text-sm font-medium text-gray-600">Favorites</p>
                <p className="text-2xl font-bold text-gray-900">{stats.favoriteRecipes}</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/meal-planner">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardContent className="p-6 flex flex-col items-center">
                <Calendar className="h-8 w-8 text-blue-500 mb-2" />
                <p className="text-sm font-medium text-gray-600">Meal Plans</p>
                <p className="text-2xl font-bold text-gray-900">{stats.mealPlansThisWeek}</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/pantry">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardContent className="p-6 flex flex-col items-center">
                <ShoppingCart className="h-8 w-8 text-green-500 mb-2" />
                <p className="text-sm font-medium text-gray-600">Pantry Items</p>
                <p className="text-2xl font-bold text-gray-900">{stats.pantryItems}</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Recipes */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Recent Recipes</h2>
            <Button variant="outline" asChild>
              <Link href="/recipes">View All</Link>
            </Button>
          </div>

          {recentRecipes.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No recipes yet</h3>
                <p className="text-gray-600 mb-6">Start by exploring our recipe collection or upload your own</p>
                <div className="space-x-4">
                  <Button asChild>
                    <Link href="/recipes">Browse Recipes</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentRecipes.map((recipe) => (
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
          )}
        </div>

        {/* Weekly Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              This Week's Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.mealPlansThisWeek}</p>
                <p className="text-sm text-gray-600">Meal Plans Created</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.totalRecipes}</p>
                <p className="text-sm text-gray-600">Recipes Shared</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{stats.pantryItems}</p>
                <p className="text-sm text-gray-600">Pantry Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
