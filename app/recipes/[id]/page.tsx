"use client"

import { useRef, useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import clsx from "clsx"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Clock, Users, ShoppingCart, ArrowLeft, ChefHat, Star, BarChart3, Utensils, Pencil, ChevronLeft, ChevronRight, X } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { RecipeDetailSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { RecipeReviews } from "@/components/recipe/detail/recipe-reviews"
import { RecipePricingInfo } from "@/components/recipe/detail/recipe-pricing-info"
import { RecipeActionBar } from "@/components/recipe/social/recipe-action-bar"
import { useToast } from "@/hooks"
import { applyFallbackImageStyles, getDefaultImageFallback, getRecipeImageUrl, isDefaultImageFallback } from "@/lib/image-helper"
import { useTheme } from "@/contexts/theme-context"
import { TagSelector } from "@/components/recipe/tags/tag-selector"
import { useShoppingList } from "@/hooks"
import { useAnalytics } from "@/hooks/use-analytics"
import { recipeFavoritesDB } from "@/lib/database/recipe-favorites-db"
import { getIngredientDisplayParts } from "@/lib/utils/recipe-ingredient-display"
import type { Recipe } from "@/lib/types"

type RecipeIngredientView = Recipe["ingredients"][number] & {
  amount?: string | number
  units?: string
  display_name?: string
}

export default function RecipeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()

  const { addRecipeToCart } = useShoppingList()
  const { trackEvent } = useAnalytics()

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isFloating, setIsFloating] = useState(false)
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false)
  const [cookingMode, setCookingMode] = useState(false)
  const [cookingStep, setCookingStep] = useState(0)
  const [likeCount, setLikeCount] = useState(0)
  const [isLiked, setIsLiked] = useState(false)
  const [repostCount, setRepostCount] = useState(0)
  const [isReposted, setIsReposted] = useState(false)
  const [friendLikes, setFriendLikes] = useState<{ id: string; full_name: string | null; avatar_url: string | null; username: string | null }[]>([])
  const [friendProfileIds, setFriendProfileIds] = useState<string[]>([])
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const pageBackgroundClass = isDark ? "bg-background" : "bg-gradient-to-br from-orange-50 to-yellow-50"
  const floatingButtonClass = clsx(
    "font-semibold text-sm sm:text-lg px-3 py-2 sm:px-6 sm:py-3 shadow-lg border transition-colors h-10 w-10 sm:h-auto sm:w-auto justify-center",
    isDark
      ? "bg-card text-foreground border-border hover:bg-card/90"
      : "bg-white/80 text-gray-700 border-gray-200 hover:bg-white/90 backdrop-blur-sm",
  )
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
  const isRecipeOwner = Boolean(user && recipe && user.id === recipe.author_id)
  const themeName = isDark ? "dark" : "light"
  const imageFallback = getDefaultImageFallback(themeName)
  const recipeImageUrl = getRecipeImageUrl(recipe?.content?.image_url || recipe?.image_url, themeName)
  const isFallbackImage = isDefaultImageFallback(recipeImageUrl)

  // True only when every ingredient has been matched to a standardized entry.
  // Unmatched ingredients can't be priced or added to a shopping list.
  const allIngredientsLinked =
    recipe !== null &&
    (recipe.ingredients?.length ?? 0) > 0 &&
    recipe.ingredients.every((ing: any) => ing.standardizedIngredientId ?? ing.standardized_ingredient_id)

  useEffect(() => {
    if (!params.id) return

    const recipeId = params.id as string

    const loadSocialData = async () => {
      try {
        const res = await fetch(`/api/recipes/${recipeId}/social`)
        if (!res.ok) return
        const json = await res.json()
        setLikeCount(json.likeCount ?? 0)
        setIsLiked(json.isLiked ?? false)
        setRepostCount(json.repostCount ?? 0)
        setIsReposted(json.isReposted ?? false)
        setFriendLikes(json.friendLikes ?? [])
        setFriendProfileIds(json.friendProfileIds ?? [])
      } catch {
        // social data is non-critical, fail silently
      }
    }

    const loadRecipe = async () => {
      try {
        const res = await fetch(`/api/recipes/${recipeId}`)
        if (!res.ok) {
          throw new Error("Recipe not found")
        }
        const json = await res.json()
        if (!json.recipe) {
          throw new Error("Recipe not found")
        }
        setRecipe(json.recipe)
        trackEvent("recipe_viewed", { recipe_id: recipeId, recipe_title: json.recipe.title, source: "direct" })
      } catch (error) {
        console.error("Error loading recipe:", error)
        router.push("/recipes")
      } finally {
        setLoading(false)
      }
    }

    const checkIfFavorite = async () => {
      if (!user) return

      try {
        const favorited = await recipeFavoritesDB.isFavorite(user.id, recipeId)
        setIsFavorite(favorited)
      } catch (error) {
        console.error("Error checking if favorited:", error)
        setIsFavorite(false)
      }
    }

    void loadRecipe()
    void loadSocialData()
    if (user) {
      void checkIfFavorite()
    }
  }, [params.id, router, user])

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      const navbarHeight = 80
      setIsFloating(scrollTop >= navbarHeight)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const [showSwipeHint, setShowSwipeHint] = useState(false)
  const swipeTouchRef = useRef<{ active: boolean; startX: number; startY: number; startT: number }>({
    active: false,
    startX: 0,
    startY: 0,
    startT: 0,
  })

  const handleLeftEdgeTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0]
    if (!touch) return
    swipeTouchRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      startT: Date.now(),
    }
    setShowSwipeHint(true)
  }

  const handleLeftEdgeTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!swipeTouchRef.current.active) return
    const touch = e.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - swipeTouchRef.current.startX
    const dy = touch.clientY - swipeTouchRef.current.startY
    const dt = Date.now() - swipeTouchRef.current.startT

    swipeTouchRef.current.active = false

    // Simple swipe-to-go-back detection.
    // Require enough horizontal movement, low vertical deviation, and quick gesture.
    if (dx > 70 && Math.abs(dy) < 60 && dt < 700) {
      router.back()
    }
  }

  useEffect(() => {
    if (!showSwipeHint) return
    const t = window.setTimeout(() => setShowSwipeHint(false), 1400)
    return () => window.clearTimeout(t)
  }, [showSwipeHint])

  const toggleFavorite = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to favorite recipes.",
        variant: "destructive",
      })
      return
    }

    if (!params.id) return

    setIsTogglingFavorite(true)
    try {
      const newFavoriteStatus = await recipeFavoritesDB.toggleFavorite(user.id, params.id as string)
      setIsFavorite(newFavoriteStatus)
      trackEvent(newFavoriteStatus ? "recipe_added_to_favorites" : "recipe_removed_from_favorites", { recipe_id: params.id as string })

      toast({
        title: newFavoriteStatus ? "Added to favorites" : "Removed from favorites",
        description: newFavoriteStatus
          ? "Recipe has been added to your favorites."
          : "Recipe has been removed from your favorites.",
      })
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

  const handleAddToBasket = async () => {
    if (!user || !recipe) {
      if (!user) {
        toast({
          title: "Sign in required",
          description: "Please sign in to add recipes to your basket.",
          variant: "destructive",
        })
      }
      return
    }

    try {
      await addRecipeToCart(recipe.id, recipe.servings || 1)
      trackEvent("recipe_added_to_shopping_list", { recipe_id: recipe.id, servings: recipe.servings || 1 })
      toast({
        title: "Added to basket",
        description: `${recipe.title} was added to your basket.`,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to add recipe to basket"
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }

  const handleAddToPlanner = async () => {
    if (!user || !recipe) {
      if (!user) {
        toast({
          title: "Sign in required",
          description: "Please sign in to add recipes to the planner.",
          variant: "destructive",
        })
      }
      return
    }

    router.push(`/meal-planner?recipeId=${encodeURIComponent(recipe.id)}`)
  }

  const getTotalTime = () => {
    return (recipe?.prep_time || 0) + (recipe?.cook_time || 0)
  }

  const instructions = recipe?.content?.instructions || []
  const getInstructionText = (instruction: unknown): string => {
    if (typeof instruction === "string") return instruction
    if (instruction && typeof instruction === "object" && "description" in instruction) return (instruction as any).description
    if (instruction && typeof instruction === "object" && "step" in instruction) return (instruction as any).step
    return "Step description not available"
  }

  const handleStartCooking = () => {
    trackEvent("cooking_mode_started", { recipe_id: params.id as string, steps_total: instructions.length })
    setCookingStep(0)
    setCookingMode(true)
  }

  const handleCookingNext = () => {
    if (cookingStep < instructions.length - 1) {
      setCookingStep((s) => s + 1)
    } else {
      trackEvent("cooking_mode_completed", { recipe_id: params.id as string, steps_total: instructions.length })
      setCookingMode(false)
    }
  }

  const handleCookingBack = () => {
    if (cookingStep > 0) setCookingStep((s) => s - 1)
  }

  const handleExitCooking = () => {
    trackEvent("cooking_mode_exited", { recipe_id: params.id as string, step_abandoned: cookingStep, steps_total: instructions.length })
    setCookingMode(false)
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
            <p className={clsx("mb-2", descriptionTextClass)}>The recipe you&apos;re looking for doesn&apos;t exist.</p>
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
      {/* Mobile swipe affordance (left edge). Small & subtle; relies on swipe/back. */}
      <div
        className="fixed left-0 top-0 bottom-0 w-6 z-30 sm:hidden touch-pan-y"
        onTouchStart={handleLeftEdgeTouchStart}
        onTouchEnd={handleLeftEdgeTouchEnd}
      />

      <div
        className={clsx(
          "fixed z-50 transition-all duration-300",
          // Safe-area aware placement to avoid top cutoff on some mobile browsers
          isFloating
            ? "top-[calc(1rem+env(safe-area-inset-top))] left-3 sm:top-24 sm:left-4"
            : "top-[calc(1rem+env(safe-area-inset-top))] left-3 sm:top-24 sm:left-4",
        )}
      >
        {showSwipeHint && (
          <div className="absolute left-3 -top-2 -translate-y-full rounded-full bg-black/60 px-2 py-1 text-[10px] text-white/90 backdrop-blur">
            Swipe to go back
          </div>
        )}
        <Button variant="ghost" onClick={() => router.back()} className={floatingButtonClass}>
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden sm:inline">Back</span>
        </Button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-8 sm:space-y-10 lg:space-y-12">
        <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-center">
          <div className="lg:w-3/5 w-full flex flex-col">
            <div
              className={clsx(
                "relative aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-xl",
                isDark ? "border border-border bg-card" : "border border-white/40 bg-gray-100",
              )}
            >
              <Image
                src={recipeImageUrl}
                alt={recipe.title}
                fill
                sizes="(min-width: 1024px) 60vw, 100vw"
                className={isFallbackImage ? "object-contain p-4" : "object-cover"}
                onError={(event) => {
                  const target = event.currentTarget as HTMLImageElement
                  if (!target.src.includes(imageFallback)) {
                    target.src = imageFallback
                    applyFallbackImageStyles(target)
                  }
                }}
              />
            </div>

            <RecipeActionBar
              recipeId={recipe.id}
              isFavorite={isFavorite}
              isTogglingFavorite={isTogglingFavorite}
              onToggleFavorite={toggleFavorite}
              likeCount={likeCount}
              isLiked={isLiked}
              onLikeToggle={(liked, count) => { setIsLiked(liked); setLikeCount(count) }}
              repostCount={repostCount}
              isReposted={isReposted}
              onRepostToggle={(reposted, count) => { setIsReposted(reposted); setRepostCount(count) }}
              onAddToBasket={handleAddToBasket}
              onAddToPlanner={handleAddToPlanner}
              friendLikes={friendLikes}
              isAuthenticated={!!user}
              isDark={isDark}
            />
          </div>

          <div className="lg:w-2/5 w-full">
            <Card className={infoPanelClass}>
              <CardContent className="p-5 sm:p-7 lg:p-8 space-y-6 sm:space-y-8">
                <div data-tutorial="recipe-detail-header">
                  <div className="flex items-start justify-between gap-4">
                    <h1
                      className={clsx(
                        "text-2xl sm:text-3xl font-bold leading-tight",
                        isDark ? "text-foreground" : "text-gray-900",
                      )}
                    >
                      {recipe.title}
                    </h1>
                    {isRecipeOwner && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap"
                        onClick={() => { trackEvent("recipe_edit_clicked", { recipe_id: recipe.id }); router.push(`/edit-recipe/${recipe.id}`) }}
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </Button>
                    )}
                  </div>

                  <p className={clsx("leading-relaxed text-base sm:text-lg mt-6", descriptionTextClass)}>
                    {recipe.content?.description || "No description available."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4" data-tutorial="recipe-detail-stats">
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
                <div data-tutorial="recipe-detail-tags">
                  <TagSelector
                    tags={recipe.tags}
                    mode="view"
                    sections={{
                      tags: true,
                      protein: true,
                      mealType: true,
                      cuisine: recipe.cuisine_name ? false : true,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recipe Pricing Section */}
        <div className="space-y-6 sm:space-y-8">
          <div className="w-full" data-tutorial="recipe-detail-pricing">
            <RecipePricingInfo recipeId={recipe.id} />
          </div>

          <Card className={sectionCardClass} data-tutorial="recipe-detail-ingredients">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className={clsx("text-2xl font-bold", isDark ? "text-foreground" : "text-gray-900")}>
                  Ingredients
                </h3>
                {user && (
                  <span
                    title={!allIngredientsLinked ? "Some ingredients haven't been matched yet — check back shortly" : undefined}
                    className="w-full sm:w-auto"
                  >
                    <Button
                      size="sm"
                      onClick={handleAddToBasket}
                      disabled={!allIngredientsLinked}
                      data-tutorial="recipe-add-to-cart"
                      className={`${primaryButtonClass} w-full sm:w-auto`}
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Add to Basket
                    </Button>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recipe.ingredients.map((ingredient, index) => {
                  const { prefix, name } = getIngredientDisplayParts(ingredient as RecipeIngredientView)
                  return (
                    <div key={index} className={itemPillClass}>
                      <span className="text-sm leading-relaxed font-medium">
                        {prefix ? <span className="font-semibold">{prefix}</span> : null}
                        {prefix ? " " : ""}
                        {name}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className={sectionCardClass} data-tutorial="recipe-detail-instructions">
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
                {(recipe.content?.instructions || []).map((instruction: any, index: number) => (
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
              {instructions.length > 0 && (
                <Button
                  onClick={handleStartCooking}
                  data-tutorial="recipe-start-cooking"
                  className={`${primaryButtonClass} w-full md:hidden mt-4`}
                  size="lg"
                >
                  <ChefHat className="w-5 h-5 mr-2" />
                  Start Cooking
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Mobile: Interactive Cooking Mode Overlay */}
          {cookingMode && instructions.length > 0 && (
            <div className="fixed inset-0 z-[100] md:hidden flex flex-col bg-background">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <Button variant="ghost" size="icon" onClick={handleExitCooking} aria-label="Exit cooking mode">
                  <X className="h-5 w-5" />
                </Button>
                <span className="text-sm font-medium text-muted-foreground">
                  Step {cookingStep + 1} of {instructions.length}
                </span>
                <div className="w-10" />
              </div>
              <div className="flex-1 overflow-y-auto p-6 pb-8 flex flex-col justify-end items-center">
                <div
                  className={clsx(
                    "text-xl sm:text-2xl leading-relaxed max-w-lg w-full text-center mb-4",
                    isDark ? "text-foreground" : "text-gray-800",
                  )}
                >
                  {getInstructionText(instructions[cookingStep])}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 p-4 border-t border-border bg-card/50">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleCookingBack}
                  disabled={cookingStep === 0}
                  className="flex-1"
                >
                  <ChevronLeft className="h-5 w-5 mr-1" />
                  Back
                </Button>
                <Button
                  onClick={handleCookingNext}
                  size="lg"
                  className={`${primaryButtonClass} flex-1`}
                >
                  {cookingStep === instructions.length - 1 ? (
                    "Done"
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-5 w-5 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="w-full" data-tutorial="recipe-reviews">
            <RecipeReviews recipeId={recipe.id} friendProfileIds={friendProfileIds} />
          </div>
        </div>
      </div>
    </div>
  )
}
