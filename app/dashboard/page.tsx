"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChefHat, Heart, Calendar, ShoppingCart } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
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
  const { theme } = useTheme()

  const isDark = theme === "dark"

  const bgClass = isDark ? "bg-[#181813]" : "bg-gray-50"
  const textClass = isDark ? "text-[#e8dcc4]" : "text-gray-900"
  const mutedTextClass = isDark ? "text-[#e8dcc4]/70" : "text-gray-600"
  const cardBgClass = isDark ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white"
  const buttonClass = isDark
    ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
    : "bg-orange-500 hover:bg-orange-600 text-white"
  const buttonOutlineClass = isDark
    ? "border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 hover:text-[#e8dcc4]"
    : "border-gray-300 hover:bg-gray-50"

  const quickActionButtonClass = isDark
    ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#181813] hover:text-[#e8dcc4] hover:border-[#e8dcc4] border-2 border-transparent transition-all"
    : "bg-orange-500 hover:bg-orange-600 text-white"

  useEffect(() => {
    if (user) {
      loadDashboardData()
    }
  }, [user])

  const loadDashboardData = async () => {
    if (!user) return

    try {
      setLoading(true)

      const { count: recipesCount } = await supabase
        .from("recipes")
        .select("*", { count: "exact", head: true })
        .eq("author_id", user.id)

      const { count: favoritesCount } = await supabase
        .from("recipe_favorites") // Use recipe_favorites table
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)

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
      <div className={`min-h-screen flex items-center justify-center ${bgClass}`}>
        <div
          className={`animate-spin rounded-full h-12 w-12 border-b-2 ${isDark ? "border-[#e8dcc4]" : "border-orange-500"}`}
        ></div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${bgClass}`}>
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-2 ${textClass}`}>Dashboard</h1>
          <p className={mutedTextClass}>Welcome back! Here's your cooking overview.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className={cardBgClass}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-sm font-medium ${textClass}`}>Your Recipes</CardTitle>
              <ChefHat className={`h-4 w-4 ${isDark ? "text-[#e8dcc4]" : "text-orange-500"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${textClass}`}>{stats.totalRecipes}</div>
              <p className={`text-xs mt-1 ${mutedTextClass}`}>Recipes created</p>
            </CardContent>
          </Card>

          <Card className={cardBgClass}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-sm font-medium ${textClass}`}>Favorites</CardTitle>
              <Heart className={`h-4 w-4 ${isDark ? "text-[#e8dcc4]" : "text-red-500"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${textClass}`}>{stats.favoriteRecipes}</div>
              <p className={`text-xs mt-1 ${mutedTextClass}`}>Saved recipes</p>
            </CardContent>
          </Card>

          <Card className={cardBgClass}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-sm font-medium ${textClass}`}>Meal Plan</CardTitle>
              <Calendar className={`h-4 w-4 ${isDark ? "text-[#e8dcc4]" : "text-blue-500"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${textClass}`}>{stats.plannedMeals}</div>
              <p className={`text-xs mt-1 ${mutedTextClass}`}>Meals this week</p>
            </CardContent>
          </Card>

          <Card className={cardBgClass}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-sm font-medium ${textClass}`}>Shopping List</CardTitle>
              <ShoppingCart className={`h-4 w-4 ${isDark ? "text-[#e8dcc4]" : "text-green-500"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${textClass}`}>{stats.shoppingItems}</div>
              <p className={`text-xs mt-1 ${mutedTextClass}`}>Items to buy</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className={`mb-8 ${cardBgClass}`}>
          <CardHeader>
            <CardTitle className={textClass}>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/recipes/upload">
                <Button className={`w-full h-24 flex flex-col gap-2 ${quickActionButtonClass}`}>
                  <ChefHat className="h-6 w-6" />
                  <span>Upload Recipe</span>
                </Button>
              </Link>
              <Link href="/meal-planner">
                <Button className={`w-full h-24 flex flex-col gap-2 ${quickActionButtonClass}`}>
                  <Calendar className="h-6 w-6" />
                  <span>Plan Meals</span>
                </Button>
              </Link>
              <Link href="/shopping">
                <Button className={`w-full h-24 flex flex-col gap-2 ${quickActionButtonClass}`}>
                  <ShoppingCart className="h-6 w-6" />
                  <span>Shopping List</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Recipes */}
        <Card className={cardBgClass}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className={textClass}>Recent Recipes</CardTitle>
              <Link href="/recipes">
                <Button variant="ghost" size="sm" className={buttonOutlineClass}>
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
                    <Card className={`overflow-hidden hover:shadow-lg transition-shadow cursor-pointer ${cardBgClass}`}>
                      <img
                        src={recipe.image_url || "/placeholder.svg"}
                        alt={recipe.title}
                        className="w-full h-40 object-cover"
                      />
                      <CardContent className="p-4">
                        <h3 className={`font-semibold truncate ${textClass}`}>{recipe.title}</h3>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className={isDark ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : ""}>
                            {recipe.difficulty}
                          </Badge>
                          <span className={mutedTextClass}>{recipe.prep_time + recipe.cook_time} min</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <ChefHat className={`h-12 w-12 mx-auto mb-4 ${isDark ? "text-[#e8dcc4]/30" : "text-gray-300"}`} />
                <p className={mutedTextClass}>No recipes yet. Start by uploading your first recipe!</p>
                <Link href="/recipes/upload">
                  <Button className={`mt-4 ${buttonClass}`}>Upload Recipe</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
