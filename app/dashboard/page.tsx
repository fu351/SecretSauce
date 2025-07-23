"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ChefHat, DollarSign, Calendar, Heart, Plus } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { RecipeCard } from "@/components/recipe-card"
import Link from "next/link"

export default function DashboardPage() {
  const { user, profile } = useAuth()
  const [stats, setStats] = useState({
    recipesCooked: 0,
    moneySaved: 0,
    mealsPlanned: 0,
    favoriteRecipes: 0,
  })
  const [recentRecipes, setRecentRecipes] = useState([])
  const [weeklyBudget, setWeeklyBudget] = useState({ used: 45, total: 100 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user])

  const fetchDashboardData = async () => {
    try {
      // Fetch user's favorite recipes
      const { data: favorites, error: favError } = await supabase
        .from("recipe_favorites")
        .select("recipe_id")
        .eq("user_id", user?.id)

      if (favError && !favError.message.includes("does not exist")) {
        throw favError
      }

      // Fetch recent recipes based on user preferences
      const { data: recipes, error: recipeError } = await supabase
        .from("recipes")
        .select(`
        *,
        profiles (
          full_name,
          avatar_url
        )
      `)
        .limit(6)
        .order("created_at", { ascending: false })

      if (recipeError && !recipeError.message.includes("does not exist")) {
        throw recipeError
      }

      setStats((prev) => ({
        ...prev,
        favoriteRecipes: favorites?.length || 0,
      }))

      setRecentRecipes(recipes || [])
    } catch (error) {
      console.warn("Database not fully set up:", error)
      // Set empty data when database isn't ready
      setRecentRecipes([])
    } finally {
      setLoading(false)
    }
  }

  const getPersonalizedGreeting = () => {
    if (!profile?.primary_goal) return "Welcome to Secret Sauce!"

    switch (profile.primary_goal) {
      case "cooking":
        return "Ready to cook something amazing?"
      case "budgeting":
        return "Let's save money on groceries!"
      case "both":
        return "Cook better, spend less!"
      default:
        return "Welcome to Secret Sauce!"
    }
  }

  const getRecommendedActions = () => {
    if (!profile?.primary_goal) return []

    const actions = []

    if (profile.primary_goal === "cooking" || profile.primary_goal === "both") {
      actions.push({
        title: "Discover New Recipes",
        description: `Find ${profile.cooking_level || "beginner"} recipes`,
        icon: ChefHat,
        href: "/recipes",
        color: "bg-orange-100 text-orange-600",
      })
    }

    if (profile.primary_goal === "budgeting" || profile.primary_goal === "both") {
      actions.push({
        title: "Plan This Week's Meals",
        description: "Save money with meal planning",
        icon: Calendar,
        href: "/meal-planner",
        color: "bg-green-100 text-green-600",
      })
    }

    actions.push({
      title: "Compare Grocery Prices",
      description: "Find the best deals near you",
      icon: DollarSign,
      href: "/shopping",
      color: "bg-blue-100 text-blue-600",
    })

    return actions
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{getPersonalizedGreeting()}</h1>
            <p className="text-gray-600 mt-1">
              {profile?.full_name ? `Welcome back, ${profile.full_name}!` : "Here's what's cooking today"}
            </p>
          </div>
          <Button asChild className="bg-orange-500 hover:bg-orange-600">
            <Link href="/recipes/upload">
              <Plus className="h-4 w-4 mr-2" />
              Add Recipe
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Recipes Tried</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.recipesCooked}</p>
                </div>
                <ChefHat className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Money Saved</p>
                  <p className="text-2xl font-bold text-gray-900">${stats.moneySaved}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Meals Planned</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.mealsPlanned}</p>
                </div>
                <Calendar className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Favorite Recipes</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.favoriteRecipes}</p>
                </div>
                <Heart className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {getRecommendedActions().map((action, index) => {
            const Icon = action.icon
            return (
              <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
                <Link href={action.href}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-lg ${action.color}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{action.title}</h3>
                        <p className="text-sm text-gray-600">{action.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            )
          })}
        </div>

        {/* Budget Tracking */}
        {(profile?.primary_goal === "budgeting" || profile?.primary_goal === "both") && (
          <Card>
            <CardHeader>
              <CardTitle>Weekly Budget</CardTitle>
              <CardDescription>Track your grocery spending</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    ${weeklyBudget.used} of ${weeklyBudget.total} used
                  </span>
                  <Badge variant={weeklyBudget.used > weeklyBudget.total * 0.8 ? "destructive" : "secondary"}>
                    {Math.round((weeklyBudget.used / weeklyBudget.total) * 100)}%
                  </Badge>
                </div>
                <Progress value={(weeklyBudget.used / weeklyBudget.total) * 100} className="h-2" />
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Remaining: ${weeklyBudget.total - weeklyBudget.used}</span>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/shopping">View Details</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Recipes */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {profile?.primary_goal === "cooking" ? "Recommended for You" : "Popular Recipes"}
            </h2>
            <Button variant="outline" asChild>
              <Link href="/recipes">View All</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentRecipes.slice(0, 6).map((recipe: any) => (
              <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                <RecipeCard
                  id={recipe.id}
                  title={recipe.title}
                  image={recipe.image_url}
                  rating={recipe.rating_avg || 0}
                  difficulty={recipe.difficulty}
                  comments={0}
                  tags={recipe.dietary_tags || []}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
