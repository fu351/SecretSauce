"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import clsx from "clsx"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Heart, ShoppingCart, ArrowLeft, ChefHat, Star, BarChart3, Utensils } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { RecipeDetailSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { RecipeReviews } from "@/components/recipe/detail/recipe-reviews"
import { RecipePricingInfo } from "@/components/recipe/detail/recipe-pricing-info"
import { useToast } from "@/hooks"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { useTheme } from "@/contexts/theme-context"
import { TagSelector } from "@/components/recipe/tags/tag-selector"
// Import the new hook
import { useShoppingList } from "@/hooks" // Adjust path if needed

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
  dietary_tags: string[]
  ingredients: Ingredient[]
  instructions: any[]
  author_id: string
  created_at: string
  rating_avg?: number
  rating_count?: number
  nutrition?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  }
}

export default function RecipeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  
  // Use the hook for shopping list actions
  const { addRecipeToCart } = useShoppingList()

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isFloating, setIsFloating] = useState(false)
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false)
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const pageBackgroundClass = isDark ? "bg-background" : "bg-gradient-to-br from-orange-50 to-yellow-50"
  const floatingButtonClass = clsx(
    "font-bold text-lg px-6 py-3 shadow-lg border transition-colors w-full sm:w-auto justify-center",
    isDark
      ? "bg-card text-foreground border-border hover:bg-card/90"
      : "bg-white/80 text-gray-700 border-gray-200 hover:bg-white/90 backdrop-blur-sm",
  )
  const imageActionButtonClass = isDark ? "bg-card/80 text-foreground hover:bg-card" : "bg-white/90 hover:bg-white"
  const infoPanelClass = clsx(
    "shadow-lg rounded-2xl border",
    isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0",
  )
  const descriptionTextClass = isDark ? "text-muted-foreground" : "text-gray-600"
  const statCardClass = clsx(
    "flex items-center gap-3 p-4 rounded-lg shadow-sm border transition-colors",
    isDark ? "bg-secondary/70 border-border text-foreground" : "bg-white/80 backdrop-blur-sm border-white/50",
  )
  const statIconClass = isDark ? "text-primary" : "text-gray-400"
  const statLabelClass = isDark ? "text-muted-foreground" : "text-gray-500"
  const badgeCuisineClass = isDark ? "bg-primary/15 text-primary border border-primary/30" : "bg-blue-100 text-blue-700"
  const badgeDietClass = isDark ? "bg-secondary/70 text-foreground border border-border" : "bg-gray-100 text-gray-700"
  const sectionCardClass = clsx(
    "shadow-lg border rounded-2xl",
    isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0",
  )
  const itemPillClass = clsx(
    "flex items-start gap-3 p-3 rounded-lg shadow-sm border",
    isDark ? "bg-secondary/70 border-border text-foreground" : "bg-white/80 backdrop-blur-sm border-white/50",
  )
  const instructionCardClass = clsx(
    "flex gap-4 p-4 rounded-lg shadow-sm border",
    isDark ? "bg-secondary/70 border-border" : "bg-white/80 backdrop-blur-sm border-white/50",
  )
  const instructionStepBadgeClass = clsx(
    "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
    isDark ? "bg-primary text-primary-foreground" : "bg-orange-500 text-white",
  )
  const instructionTextClass = isDark ? "text-foreground" : "text-gray-700"
  const primaryButtonClass = isDark
    ? "bg-primary text-primary-foreground hover:bg-primary/90"
    : "bg-orange-500 hover:bg-orange-600"

  useEffect(() => {
    if (params.id) {
      loadRecipe()
      if (user) {
        checkIfFavorite()
      }
    }
  }, [params.id, user])

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      const navbarHeight = 80
      setIsFloating(scrollTop >= navbarHeight)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const loadRecipe = async () => {
    if (!params.id) {
      return
    }

    try {
      const { data, error } = await supabase.from("recipes").select("*").eq("id", params.id).single()

      if (error) throw error

      const processedRecipe = {
        ...data,
        ingredients: data.ingredients || [],
        instructions: data.instructions || [],
        dietary_tags: data.dietary_tags || [],
        cuisine: data.cuisine || "",
      }

      setRecipe(processedRecipe)
    } catch (error) {
      console.error("Error loading recipe:", error)
      router.push("/recipes")
    } finally {
      setLoading(false)
    }
  }

  const checkIfFavorite = async () => {
    if (!user || !params.id) return

    try {
      const { data, error } = await supabase
        .from("recipe_favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("recipe_id", params.id)
        .order("created_at", { ascending: false })
        .limit(1)

      if (error && error.code !== "PGRST116") {
        console.error("Error checking favorite:", error)
        return
      }

      setIsFavorite(data && data.length > 0)
    } catch (error) {
      console.error("Error checking if favorited:", error)
      setIsFavorite(false)
    }
  }

  const toggleFavorite = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to favorite recipes.",
        variant: "destructive",
      })
      return
    }

    setIsTogglingFavorite(true)
    try {
      if (isFavorite) {
        const { error } = await supabase
          .from("recipe_favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("recipe_id", params.id)

        if (error) throw error
        setIsFavorite(false)
        toast({
          title: "Removed from favorites",
          description: "Recipe has been removed from your favorites.",
        })
      } else {
        const { error } = await supabase.from("recipe_favorites").insert({
          user_id: user.id,
          recipe_id: params.id,
        })

        if (error) throw error
        setIsFavorite(true)
        toast({
          title: "Added to favorites",
          description: "Recipe has been added to your favorites.",
        })
      }
    } catch (error) {
      console.error("Error toggling favorite:", error)
      toast({
        title: "Error",
        description: "Failed to update favorites. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsTogglingFavorite(false)
    }
  }

  // --- UPDATED HANDLER: Using useShoppingList hook with new API ---
  const handleAddToShoppingList = async () => {
    if (!user || !recipe) {
      if (!user) {
        toast({ title: "Sign in required", description: "Please sign in to manage your shopping list.", variant: "destructive" })
      }
      return
    }

    // Add recipe to cart - servings will be fetched from the recipe table
    // Toast and error handling is managed inside the hook
    await addRecipeToCart(recipe.id)
  }

  const getTotalTime = () => {
    return (recipe?.prep_time || 0) + (recipe?.cook_time || 0)
  }

  if (loading) {
    return <RecipeDetailSkeleton />
  }

  if (!recipe) {
    return (
      <div
        className={clsx(
          "min-h-screen flex items-center justify-center px-4",
          isDark ? "bg-background" : "bg-gradient-to-br from-orange-50 to-yellow-50",
        )}
      >
        <Card
          className={clsx(
            "max-w-md mx-auto shadow-lg",
            isDark ? "bg-card border border-border" : "bg-white/90 backdrop-blur-sm border-0",
          )}
        >
          <CardContent className="p-6 text-center space-y-4">
            <h2 className={clsx("text-2xl font-bold", isDark ? "text-foreground" : "text-gray-900")}>Recipe Not Found</h2>
            <p className={clsx("mb-2", descriptionTextClass)}>The recipe you're looking for doesn't exist.</p>
            <Button onClick={() => router.push("/recipes")} className={primaryButtonClass}>
              Browse Recipes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={clsx("min-h-screen transition-colors", pageBackgroundClass)}>
      <div
        className={clsx(
          "fixed z-50 transition-all duration-300",
          isFloating ? "top-24 left-4 sm:top-28 sm:left-6" : "top-24 left-4 sm:top-28 sm:left-6",
        )}
      >
        <Button variant="ghost" onClick={() => router.back()} className={floatingButtonClass}>
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        <div className="flex flex-col lg:flex-row gap-8 items-center">
          <div className="lg:w-3/5 w-full">
            <div
              className={clsx(
                "relative overflow-hidden rounded-2xl shadow-xl",
                isDark ? "border border-border" : "border border-white/40",
              )}
            >
              <img
                src={getRecipeImageUrl(recipe.image_url) || "/placeholder.svg"}
                alt={recipe.title}
                className="w-full h-[360px] sm:h-[420px] md:h-[500px] object-cover"
              />
              <div className="absolute top-4 right-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className={clsx("transition-colors", imageActionButtonClass)}
                  onClick={toggleFavorite}
                  disabled={isTogglingFavorite}
                >
                  <Heart
                    className={clsx(
                      "h-4 w-4",
                      isFavorite ? "fill-red-500 text-red-500" : isDark ? "text-foreground" : "text-gray-700",
                    )}
                  />
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:w-2/5 w-full">
            <Card className={infoPanelClass}>
              <CardContent className="p-8 space-y-8">
                <div>
                  <h1
                    className={clsx(
                      "text-2xl sm:text-3xl font-bold leading-tight",
                      isDark ? "text-foreground" : "text-gray-900",
                    )}
                  >
                    {recipe.title}
                  </h1>
                </div>

                <p className={clsx("leading-relaxed text-base sm:text-lg", descriptionTextClass)}>{recipe.description}</p>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className={statCardClass}>
                    <Clock className={clsx("h-5 w-5", statIconClass)} />
                    <div>
                      <p className={clsx("text-sm", statLabelClass)}>Total Time</p>
                      <p className="font-semibold">{getTotalTime()} minutes</p>
                    </div>
                  </div>

                  <div className={statCardClass}>
                    <BarChart3 className={clsx("h-5 w-5", statIconClass)} />
                    <div>
                      <p className={clsx("text-sm", statLabelClass)}>Difficulty</p>
                      <p className="font-semibold capitalize">{recipe.difficulty}</p>
                    </div>
                  </div>

                  <div className={statCardClass}>
                    <Users className={clsx("h-5 w-5", statIconClass)} />
                    <div>
                      <p className={clsx("text-sm", statLabelClass)}>Servings</p>
                      <p className="font-semibold">{recipe.servings} servings</p>
                    </div>
                  </div>

                  <div className={statCardClass}>
                    <Star className={clsx("h-5 w-5", statIconClass)} />
                    <div>
                      <p className={clsx("text-sm", statLabelClass)}>Rating</p>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-semibold">{(recipe.rating_avg || 0).toFixed(1)}</span>
                        <span className={clsx("text-xs", statLabelClass)}>({recipe.rating_count || 0})</span>
                      </div>
                    </div>
                  </div>
                </div>

                {recipe.nutrition && (
                  <div className={statCardClass} data-tutorial="nutrition-info">
                    <Utensils className={clsx("h-5 w-5", statIconClass)} />
                    <div>
                      <p className={clsx("text-sm", statLabelClass)}>Nutrition</p>
                      <div className="flex gap-4 text-sm flex-wrap">
                        {recipe.nutrition.calories && (
                          <span className="font-semibold">{recipe.nutrition.calories} Calories</span>
                        )}
                        {recipe.nutrition.protein && (
                          <span className="font-semibold">{recipe.nutrition.protein}g Protein</span>
                        )}
                        {recipe.nutrition.fat && <span className="font-semibold">{recipe.nutrition.fat}g Fat</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tag Display System */}
                <TagSelector
                  tags={recipe.tags}
                  mode="view"
                  sections={{
                    dietary: true,
                    allergens: true,
                    protein: true,
                    mealType: true,
                    cuisine: recipe.cuisine ? false : true,
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recipe Pricing Section */}
        <div className="space-y-8">
          <div className="w-full">
            <RecipePricingInfo recipeId={recipe.id} />
          </div>

          <Card className={sectionCardClass}>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className={clsx("text-2xl font-bold", isDark ? "text-foreground" : "text-gray-900")}>
                  Ingredients
                </h3>
                {user && (
                  <Button size="sm" onClick={handleAddToShoppingList} className={`${primaryButtonClass} w-full sm:w-auto`}>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to cart
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recipe.ingredients.map((ingredient, index) => (
                  <div key={index} className={itemPillClass}>
                    <span className="text-sm leading-relaxed font-medium">
                      {ingredient.amount} {ingredient.unit} {ingredient.name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className={sectionCardClass}>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <h3
                className={clsx(
                  "text-2xl font-bold flex items-center gap-2",
                  isDark ? "text-foreground" : "text-gray-900",
                )}
              >
                <ChefHat className={clsx("h-6 w-6", isDark ? "text-primary" : "text-orange-500")} />
                Instructions
              </h3>
              <div className="space-y-3 sm:space-y-4">
                {recipe.instructions.map((instruction, index) => (
                  <div key={index} className={instructionCardClass}>
                    <div className={instructionStepBadgeClass}>{index + 1}</div>
                    <div className="flex-1">
                      <p className={clsx("leading-relaxed", instructionTextClass)}>
                        {typeof instruction === "string"
                          ? instruction
                          : instruction.description || instruction.step || "Step description not available"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="w-full">
            <RecipeReviews recipeId={recipe.id} />
          </div>
        </div>
      </div>
    </div>
  )
}