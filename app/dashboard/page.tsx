"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChefHat, Heart, Calendar, ShoppingCart } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format, startOfWeek } from "date-fns"

interface DashboardStats {
  totalRecipes: number
  favoriteRecipes: number
  plannedMeals: number
  shoppingItems: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRecipes: 0,
    favoriteRecipes: 0,
    plannedMeals: 0,
    shoppingItems: 0,
  })
  const [recentRecipes, setRecentRecipes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      loadDashboardData()
    }
  }, [user])

  const loadDashboardData = async () => {
    if (!user) return

    try {
      setLoading(true)

      // Get user's recipes count
      const { count: recipesCount } = await supabase
        .from("recipes")
        .select("*", { count: "exact", head: true })
        .eq("author_id", user.id)

      // Get favorites count
      const { count: favoritesCount } = await supabase
        .from("favorites")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)

      // Get this week's meal plan
      const weekStart = format(startOfWeek(new Date()), "yyyy-MM-dd")
      const { data: mealPlanData } = await supabase
        .from("meal_plans")
        .select("meals")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .single()

      let plannedMealsCount = 0
      if (mealPlanData?.meals) {
        Object.values(mealPlanData.meals).forEach((dayMeals: any) => {
          if (dayMeals.breakfast) plannedMealsCount++
          if (dayMeals.lunch) plannedMealsCount++
          if (dayMeals.dinner) plannedMealsCount++
        })
      }

      // Get shopping list items
      const { data: shoppingListData } = await supabase
        .from("shopping_lists")
        .select("items")
        .eq("user_id", user.id)
        .single()

      const shoppingItemsCount = shoppingListData?.items?.length || 0

      setStats({
        totalRecipes: recipesCount || 0,
        favoriteRecipes: favoritesCount || 0,
        plannedMeals: plannedMealsCount,
        shoppingItems: shoppingItemsCount,
      })

      // Get recent recipes
      const { data: recipes } = await supabase
        .from("recipes")
        .select("*")
        .eq("author_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3)

      setRecentRecipes(recipes || [])
    } catch (error) {
      console.error("Error loading dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's your cooking overview.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Your Recipes</CardTitle>
              <ChefHat className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRecipes}</div>
              <p className="text-xs text-gray-500 mt-1">Recipes created</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Favorites</CardTitle>
              <Heart className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.favoriteRecipes}</div>
              <p className="text-xs text-gray-500 mt-1">Saved recipes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Meal Plan</CardTitle>
              <Calendar className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.plannedMeals}</div>
              <p className="text-xs text-gray-500 mt-1">Meals this week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Shopping List</CardTitle>
              <ShoppingCart className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.shoppingItems}</div>
              <p className="text-xs text-gray-500 mt-1">Items to buy</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/recipes/upload">
                <Button className="w-full h-24 flex flex-col gap-2">
                  <ChefHat className="h-6 w-6" />
                  <span>Upload Recipe</span>
                </Button>
              </Link>
              <Link href="/meal-planner">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2 bg-transparent">
                  <Calendar className="h-6 w-6" />
                  <span>Plan Meals</span>
                </Button>
              </Link>
              <Link href="/shopping">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2 bg-transparent">
                  <ShoppingCart className="h-6 w-6" />
                  <span>Shopping List</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Recipes */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Recipes</CardTitle>
              <Link href="/recipes">
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentRecipes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {recentRecipes.map((recipe) => (
                  <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                    <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                      <img
                        src={recipe.image_url || "/placeholder.svg"}
                        alt={recipe.title}
                        className="w-full h-40 object-cover"
                      />
                      <CardContent className="p-4">
                        <h3 className="font-semibold truncate">{recipe.title}</h3>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary">{recipe.difficulty}</Badge>
                          <span className="text-sm text-gray-500">{recipe.prep_time + recipe.cook_time} min</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <ChefHat className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No recipes yet. Start by uploading your first recipe!</p>
                <Link href="/recipes/upload">
                  <Button className="mt-4">Upload Recipe</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
