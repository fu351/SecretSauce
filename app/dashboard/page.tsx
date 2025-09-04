"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, TrendingUp, ChefHat, ShoppingCart, Heart, Package, Plus, AlertTriangle } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { RecipeCard } from "@/components/recipe-card"
import { Badge } from "@/components/ui/badge"

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
  nutrition?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  } | null
}

interface PantryItem {
  id: string
  name: string
  quantity: number
  unit: string
  expiry_date: string | null
  category: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRecipes: 0,
    favoriteRecipes: 0,
    mealPlansThisWeek: 0,
    pantryItems: 0,
  })
  const [recentRecipes, setRecentRecipes] = useState<RecentRecipe[]>([])
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const { user, profile } = useAuth()

  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user])

  // Safety: force refresh once if still loading after 5s
  useEffect(() => {
    if (!loading) return
    const alreadyRefreshed = typeof window !== 'undefined' && sessionStorage.getItem('dashboard_force_refresh') === 'true'
    if (alreadyRefreshed) return
    const t = setTimeout(() => {
      if (loading) {
        try {
          sessionStorage.setItem('dashboard_force_refresh', 'true')
        } catch {}
        if (typeof window !== 'undefined') {
          window.location.reload()
        }
      }
    }, 5000)
    return () => clearTimeout(t)
  }, [loading])

  const fetchDashboardData = async () => {
    if (!user) return

    try {
      // Fetch stats and recent data
      const [recipesResult, favoritesResult, mealPlansResult, pantryResult, recentRecipesResult, pantryItemsResult] = await Promise.all([
        supabase.from("recipes").select("id", { count: "exact", head: true }).eq("author_id", user.id),
        supabase.from("recipe_favorites").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase
          .from("meal_plans")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("week_start", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
        supabase.from("pantry_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase
          .from("recipes")
          .select("id, title, image_url, rating_avg, difficulty, rating_count, dietary_tags, nutrition")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("pantry_items")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(8),
      ])

      setStats({
        totalRecipes: recipesResult.count || 0,
        favoriteRecipes: favoritesResult.count || 0,
        mealPlansThisWeek: mealPlansResult.count || 0,
        pantryItems: pantryResult.count || 0,
      })

      const baseRecent = recentRecipesResult.data || []

      // If rating fields are not populated in recipes table, compute from recipe_ratings as fallback
      const recipeIds = baseRecent.map((r) => r.id)
      if (recipeIds.length > 0) {
        const { data: ratingsAgg } = await supabase
          .from("recipe_ratings")
          .select("recipe_id, count:count(), avg:avg(rating)")
          .in("recipe_id", recipeIds)
          .group("recipe_id")

        const aggMap = new Map<string, { count: number; avg: number }>()
        ratingsAgg?.forEach((row: any) => {
          aggMap.set(row.recipe_id, {
            count: Number(row.count ?? 0),
            avg: Number(row.avg ?? 0),
          })
        })

        const normalized = baseRecent.map((r) => {
          const agg = aggMap.get(r.id)
          const ratingAvg = r.rating_avg != null ? Number(r.rating_avg) : (agg ? agg.avg : 0)
          const ratingCount = r.rating_count != null ? Number(r.rating_count) : (agg ? agg.count : 0)
          return { ...r, rating_avg: ratingAvg, rating_count: ratingCount }
        })

        setRecentRecipes(normalized)
      } else {
        setRecentRecipes(baseRecent.map((r) => ({
          ...r,
          rating_avg: Number(r.rating_avg ?? 0),
          rating_count: Number(r.rating_count ?? 0),
        })))
      }

      setPantryItems(pantryItemsResult.data || [])
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
      setPantryItems([])
    } finally {
      setLoading(false)
    }
  }

  const getExpiringItems = () => {
    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
    
    return pantryItems.filter(item => {
      if (!item.expiry_date) return false
      return new Date(item.expiry_date) <= threeDaysFromNow
    })
  }

  const getExpiredItems = () => {
    return pantryItems.filter(item => {
      if (!item.expiry_date) return false
      return new Date(item.expiry_date) < new Date()
    })
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Produce": return "🥬"
      case "Dairy": return "🥛"
      case "Meat & Seafood": return "🥩"
      case "Pantry Staples": return "🥫"
      case "Frozen": return "❄️"
      case "Beverages": return "🥤"
      case "Snacks": return "🍪"
      case "Condiments": return "🧂"
      case "Baking": return "🍞"
      default: return "📦"
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

  const expiringItems = getExpiringItems()
  const expiredItems = getExpiredItems()

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

        {/* Pantry Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="h-6 w-6 text-green-600" />
              Pantry Overview
            </h2>
            <Button asChild>
              <Link href="/pantry">
                <Plus className="h-4 w-4 mr-2" />
                Manage Pantry
              </Link>
            </Button>
          </div>

          {/* Pantry Alerts */}
          {(expiredItems.length > 0 || expiringItems.length > 0) && (
            <div className="mb-6 space-y-3">
              {expiredItems.length > 0 && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="font-medium text-red-800">
                          {expiredItems.length} item{expiredItems.length !== 1 ? 's' : ''} expired
                        </p>
                        <p className="text-sm text-red-600">
                          {expiredItems.map(item => item.name).join(', ')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {expiringItems.length > 0 && (
                <Card className="border-yellow-200 bg-yellow-50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      <div>
                        <p className="font-medium text-yellow-800">
                          {expiringItems.length} item{expiringItems.length !== 1 ? 's' : ''} expiring soon
                        </p>
                        <p className="text-sm text-yellow-600">
                          {expiringItems.map(item => item.name).join(', ')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Pantry Items Grid */}
          {pantryItems.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Your pantry is empty</h3>
                <p className="text-gray-600 mb-6">Start tracking your ingredients to reduce food waste</p>
                <Button asChild>
                  <Link href="/pantry">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Item
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {pantryItems.slice(0, 8).map((item) => (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getCategoryIcon(item.category)}</span>
                        <h4 className="font-medium text-sm truncate">{item.name}</h4>
                      </div>
                      {item.expiry_date && (
                        <Badge 
                          variant={new Date(item.expiry_date) < new Date() ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {new Date(item.expiry_date) < new Date() ? "Expired" : "Expires Soon"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {item.quantity} {item.unit}
                    </p>
                    {item.expiry_date && (
                      <p className="text-xs text-gray-500 mt-1">
                        Expires: {new Date(item.expiry_date).toLocaleDateString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
                    nutrition={recipe as any as { calories?: number; protein?: number; carbs?: number; fat?: number } as any}
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
