"use client"

import { memo } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Heart, Clock, Users, Star, ChefHat, BarChart3 } from "lucide-react"
import { applyFallbackImageStyles, getDefaultImageFallback, getRecipeImageUrl, isDefaultImageFallback } from "@/lib/image-helper"
import { formatDietaryTag } from "@/lib/tag-formatter"
import type { Recipe } from "@/lib/types"
import { useTheme } from "@/contexts/theme-context"

export interface RecipeListViewProps {
  recipes: Recipe[]
  favorites: Set<string>
  onFavoriteToggle: (recipeId: string, e?: React.MouseEvent) => Promise<void>
}

/**
 * List view for displaying recipes in detailed horizontal cards
 * Memoized for performance optimization
 */
export const RecipeListView = memo(function RecipeListView({
  recipes,
  favorites,
  onFavoriteToggle
}: RecipeListViewProps) {
  const { theme } = useTheme()
  const imageFallback = getDefaultImageFallback(theme)
  const getTotalTime = (recipe: Recipe) => {
    return (recipe.prep_time || 0) + (recipe.cook_time || 0)
  }

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case "beginner":
        return "bg-green-100 text-green-800"
      case "intermediate":
        return "bg-yellow-100 text-yellow-800"
      case "advanced":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {recipes.map((recipe: Recipe, idx: number) => (
        (() => {
          const imageSrc = getRecipeImageUrl(recipe.content?.image_url || recipe.image_url, theme) || imageFallback
          const isFallbackImage = isDefaultImageFallback(imageSrc)
          return (
        <div
          key={recipe.id}
          className="relative"
          id={idx === 0 ? "tutorial-recipe-card" : undefined}
        >
          <Link href={`/recipes/${recipe.id}`}>
            <Card className="group cursor-pointer hover:shadow-xl transition-all duration-300 bg-card backdrop-blur-sm shadow-lg overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-1/2 relative min-h-[200px] md:min-h-[300px]">
                    <Image
                      src={imageSrc}
                      alt={recipe.title}
                      fill
                      className={isFallbackImage ? "object-contain p-4" : "object-cover"}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      loading="lazy"
                      onError={(event) => {
                        const target = event.currentTarget as HTMLImageElement
                        if (!target.src.includes(imageFallback)) {
                          target.src = imageFallback
                          applyFallbackImageStyles(target)
                        }
                      }}
                    />
                  </div>

                  <div className="w-full md:w-1/2 p-4 md:p-8 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-3 md:mb-4 gap-3">
                        <h3 className="text-lg md:text-2xl font-bold group-hover:text-primary transition-colors text-foreground">
                          {recipe.title}
                        </h3>
                        <Badge className={getDifficultyColor(recipe.difficulty)}>
                          {recipe.difficulty}
                        </Badge>
                      </div>

                      <p className="mb-4 md:mb-6 line-clamp-3 text-sm md:text-base text-muted-foreground">
                        {recipe.content?.description}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-6 mb-4 md:mb-6">
                        <div className="flex items-center gap-3">
                          <Clock className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Total Time</p>
                            <p className="font-semibold text-foreground">
                              {getTotalTime(recipe)} minutes
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Users className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Servings</p>
                            <p className="font-semibold text-foreground">
                              {recipe.servings} servings
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <ChefHat className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Nutrition</p>
                            <div className="text-xs space-y-1 text-foreground">
                              {recipe.nutrition?.calories && (
                                <div>{recipe.nutrition.calories} Calories</div>
                              )}
                              {recipe.nutrition?.protein && (
                                <div>{recipe.nutrition.protein}g Protein</div>
                              )}
                              {recipe.nutrition?.fat && (
                                <div>{recipe.nutrition.fat}g Fat</div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <BarChart3 className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Rating</p>
                            <div className="flex items-center gap-1">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              <span className="font-semibold text-foreground">
                                {(recipe.rating_avg || 0).toFixed(1)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({recipe.rating_count || 0})
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {recipe.tags && recipe.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {recipe.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary">
                            {formatDietaryTag(tag)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <div className="absolute top-2 right-2 md:top-4 md:right-4 z-[5]">
            <Button
              variant="ghost"
              size="sm"
              data-favorite-button
              className={`bg-white/90 hover:bg-white ${favorites.has(recipe.id) ? "text-red-500" : "text-gray-600"}`}
              aria-label={favorites.has(recipe.id) ? "Remove from saved recipes" : "Save recipe"}
              title={favorites.has(recipe.id) ? "Remove from saved recipes" : "Save recipe"}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void onFavoriteToggle(recipe.id, e)
              }}
            >
              <Heart className={`h-4 w-4 ${favorites.has(recipe.id) ? "fill-current" : ""}`} />
            </Button>
          </div>
        </div>
          )
        })()
      ))}
    </div>
  )
})
