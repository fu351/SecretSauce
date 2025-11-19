"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChefHat, Heart, Calendar, ShoppingCart, Plus } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format, startOfWeek } from "date-fns"
import { RecipeCard } from "@/components/recipe-card"

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
        .from("recipe_favorites")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)

      const weekStart = format(startOfWeek(new Date()), "yyyy-MM-dd")
      const { data: mealPlanData } = await supabase
        .from("meal_plans")
        .select("meals")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .maybeSingle()

      let plannedMealsCount = 0
      if (mealPlanData?.meals) {
        plannedMealsCount = Array.isArray(mealPlanData.meals) ? mealPlanData.meals.length : 0
      }

      const { data: shoppingListData } = await supabase
        .from("shopping_lists")
        .select("items")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)

      const shoppingItemsCount =
        shoppingListData && shoppingListData.length > 0 ? shoppingListData[0]?.items?.length || 0 : 0

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="mb-8">
          <h2 className="text-3xl font-serif font-light mb-2 text-foreground">
            Welcome back, {user?.email?.split("@")[0]}!
          </h2>
          <p className="text-muted-foreground">Here's what's cooking in your kitchen</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
          <Link href="/your-recipes" className="block">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-border bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <ChefHat className="h-8 w-8 text-primary" />
                  <span className="text-xs text-muted-foreground">Your Recipes</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{stats.totalRecipes}</p>
                <p className="text-sm mt-1 text-muted-foreground">Recipes created</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/favorites" className="block">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-border bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Heart className="h-8 w-8 text-red-500" />
                  <span className="text-xs text-muted-foreground">Favorites</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{stats.favoriteRecipes}</p>
                <p className="text-sm mt-1 text-muted-foreground">Saved recipes</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/meal-planner" className="block">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-border bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Calendar className="h-8 w-8 text-blue-500" />
                  <span className="text-xs text-muted-foreground">Meal Plan</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{stats.plannedMeals}</p>
                <p className="text-sm mt-1 text-muted-foreground">Meals this week</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/shopping" className="block">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-border bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <ShoppingCart className="h-8 w-8 text-green-500" />
                  <span className="text-xs text-muted-foreground">Shopping List</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{stats.shoppingItems}</p>
                <p className="text-sm mt-1 text-muted-foreground">Items to buy</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Quick Actions */}
        <Card className="mb-8 border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button asChild className="w-full h-24 flex flex-col gap-2">
                <Link href="/upload-recipe">
                  <Plus className="h-6 w-6" />
                  <span>Add Recipe</span>
                </Link>
              </Button>
              <Button asChild className="w-full h-24 flex flex-col gap-2">
                <Link href="/meal-planner">
                  <Calendar className="h-6 w-6" />
                  <span>Plan Meals</span>
                </Link>
              </Button>
              <Button asChild className="w-full h-24 flex flex-col gap-2">
                <Link href="/pantry">
                  <ShoppingCart className="h-6 w-6" />
                  <span>Manage Pantry</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Recipes */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-foreground">Recent Recipes</CardTitle>
              <Link href="/your-recipes">
                <Button variant="outline" size="sm">
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
                    <RecipeCard
                      id={recipe.id}
                      title={recipe.title}
                      image={recipe.image_url || "/placeholder.svg"}
                      rating={recipe.rating_avg || 0}
                      difficulty={(recipe.difficulty as "beginner" | "intermediate" | "advanced") || "beginner"}
                      comments={recipe.rating_count || 0}
                      tags={recipe.dietary_tags || []}
                      nutrition={recipe.nutrition}
                    />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <ChefHat className="h-12 w-12 mx-auto mb-4 text-primary/30" />
                <p className="text-muted-foreground">No recipes yet. Start by uploading your first recipe!</p>
                <Link href="/upload-recipe">
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
