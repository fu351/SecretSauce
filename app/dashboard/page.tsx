"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ChefHat,
  Heart,
  Calendar,
  ShoppingCart,
  Plus,
  Truck,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { recipeDB } from "@/lib/database/recipe-db"
import { recipeFavoritesDB } from "@/lib/database/recipe-favorites-db"
import { mealPlannerDB } from "@/lib/database/meal-planner-db"
import { shoppingListDB } from "@/lib/database/store-list-db"
import Link from "next/link"
import { getWeek, getYear } from "date-fns"
import { RecipeCard } from "@/components/recipe/cards/recipe-card"
import { Recipe } from "@/lib/types"

// Tutorial Components
// TutorialOverlay is rendered globally in layout.tsx
import IOSWebAppPromptBanner from "@/components/shared/ios-webapp-prompt-banner"
import IOSWebAppInstallModal from "@/components/shared/ios-webapp-install-modal"
import { shouldShowIOSPrompt } from "@/lib/utils"
import { GraphTracker } from "@/components/dashboard/graph-tracker"
import { ProfileCard } from "@/components/social/profile-card"

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
  const [recentRecipes, setRecentRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [showIOSPrompt, setShowIOSPrompt] = useState(false)
  const [showIOSInstallModal, setShowIOSInstallModal] = useState(false)
  const { user, profile } = useAuth()

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    setLoading(true)
  }, [user])

  useEffect(() => {
    if (!user) return

    const run = async () => {
      try {
        setLoading(true)

        const now = new Date()
        const currentWeekIndex = getYear(now) * 100 + getWeek(now, { weekStartsOn: 1 })
        const [
          userRecipes,
          favoriteIds,
          mealSchedule,
          shoppingItems,
          recentRecipesData,
        ] = await Promise.all([
          recipeDB.fetchRecipesByAuthor(user.id, { limit: 1000 }),
          recipeFavoritesDB.fetchFavoriteRecipeIds(user.id),
          mealPlannerDB.fetchMealScheduleByWeekIndex(user.id, currentWeekIndex),
          shoppingListDB.fetchUserItems(user.id),
          recipeDB.fetchRecipesByAuthor(user.id, {
            sortBy: "created_at",
            limit: 3,
          }),
        ])

        setStats({
          totalRecipes: userRecipes.length,
          favoriteRecipes: favoriteIds.length,
          plannedMeals: mealSchedule.length,
          shoppingItems: shoppingItems.length,
        })

        setRecentRecipes(recentRecipesData)
      } catch (error) {
        console.error("Error loading dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [user])

  // Check if user should see iOS web app prompt
  useEffect(() => {
    // Only check on client side
    if (typeof window === "undefined") return

    // Check if iOS/Safari and not installed
    if (!shouldShowIOSPrompt()) return

    // Don't show if permanently dismissed
    const dismissed = localStorage.getItem("ios_webapp_prompt_dismissed")
    if (dismissed === "true") return

    // Random 20-30% chance
    const randomThreshold = 0.20 + (Math.random() * 0.10)
    if (Math.random() < randomThreshold) {
      setShowIOSPrompt(true)
    }
  }, [profile])

  const handleDismissIOSPrompt = () => {
    setShowIOSPrompt(false)
    if (typeof window !== "undefined") {
      localStorage.setItem("ios_webapp_prompt_dismissed", "true")
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
    <div data-tutorial="dashboard-overview">
      <IOSWebAppInstallModal
        isOpen={showIOSInstallModal}
        onClose={() => setShowIOSInstallModal(false)}
      />

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          <div className="mb-4 md:mb-8">
            <h2 className="text-xl md:text-3xl font-serif font-light mb-1 md:mb-2 text-foreground">
              Welcome back, {user?.email?.split("@")[0]}!
            </h2>
            <p className="text-sm md:text-base text-muted-foreground">Here&apos;s what&apos;s cooking in your kitchen</p>
          </div>

          {profile && <ProfileCard profile={profile} />}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6 mb-4 md:mb-8" data-tutorial="dashboard-stats">
            <Link href="/recipes?mine=true" className="block">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-border bg-card">
                <CardContent className="p-3 md:p-6">
                  <div className="flex items-center justify-between mb-2 md:mb-4">
                    <ChefHat className="h-5 w-5 md:h-8 md:w-8 text-primary" />
                    <span className="text-[10px] md:text-xs text-muted-foreground">Your Recipes</span>
                  </div>
                  <p className="text-xl md:text-3xl font-bold text-foreground">{stats.totalRecipes}</p>
                  <p className="text-xs md:text-sm mt-0.5 md:mt-1 text-muted-foreground">Recipes created</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/recipes?favorites=true" className="block">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-border bg-card">
                <CardContent className="p-3 md:p-6">
                  <div className="flex items-center justify-between mb-2 md:mb-4">
                    <Heart className="h-5 w-5 md:h-8 md:w-8 text-red-500" />
                    <span className="text-[10px] md:text-xs text-muted-foreground">Favorites</span>
                  </div>
                  <p className="text-xl md:text-3xl font-bold text-foreground">{stats.favoriteRecipes}</p>
                  <p className="text-xs md:text-sm mt-0.5 md:mt-1 text-muted-foreground">Saved recipes</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/meal-planner" className="block">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-border bg-card">
                <CardContent className="p-3 md:p-6">
                  <div className="flex items-center justify-between mb-2 md:mb-4">
                    <Calendar className="h-5 w-5 md:h-8 md:w-8 text-blue-500" />
                    <span className="text-[10px] md:text-xs text-muted-foreground">Meal Plan</span>
                  </div>
                  <p className="text-xl md:text-3xl font-bold text-foreground">{stats.plannedMeals}</p>
                  <p className="text-xs md:text-sm mt-0.5 md:mt-1 text-muted-foreground">Meals this week</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/store" className="block">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-border bg-card">
                <CardContent className="p-3 md:p-6">
                  <div className="flex items-center justify-between mb-2 md:mb-4">
                    <ShoppingCart className="h-5 w-5 md:h-8 md:w-8 text-green-500" />
                    <span className="text-[10px] md:text-xs text-muted-foreground">Shopping List</span>
                  </div>
                  <p className="text-xl md:text-3xl font-bold text-foreground">{stats.shoppingItems}</p>
                  <p className="text-xs md:text-sm mt-0.5 md:mt-1 text-muted-foreground">Items to buy</p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {showIOSPrompt && !localStorage.getItem("ios_webapp_prompt_dismissed") ? (
            <IOSWebAppPromptBanner
              onDismiss={handleDismissIOSPrompt}
              onShowInstructions={() => setShowIOSInstallModal(true)}
            />
          ) : null}

          {/* Graph Tracker */}
          <div data-tutorial="dashboard-actions">
            <GraphTracker />
          </div>

          {/* Recent Recipes */}
          <Card className="border-border bg-card" data-tutorial="dashboard-recents">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground">Recent Recipes</CardTitle>
                <Link href="/recipes?mine=true">
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
                        content={recipe.content}
                        rating_avg={recipe.rating_avg || 0}
                        difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
                        comments={recipe.rating_count || 0}
                        tags={recipe.tags}
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
    </div>
  )
}
