import { memo, useRef, useState } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, Flame, Heart, Star, Users } from "lucide-react"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { formatDietaryTag } from "@/lib/tag-formatter"
import type { Recipe } from "@/lib/types"

export interface RecipeGridProps {
  recipes: Recipe[]
  favorites: Set<string>
  onFavoriteToggle: (recipeId: string, e?: React.MouseEvent) => Promise<void>
  onRecipeClick: (recipeId: string) => void
}

/**
 * Grid view for displaying recipe cards in a tile layout
 * Memoized for performance optimization
 */
export const RecipeGrid = memo(function RecipeGrid({
  recipes,
  favorites,
  onFavoriteToggle,
  onRecipeClick
}: RecipeGridProps) {
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null)
  const lastTapRef = useRef<{ id: string | null; ts: number }>({ id: null, ts: 0 })
  const aspectClasses = [
    "aspect-[1/1]",
    "aspect-[4/5]",
    "aspect-[3/4]",
    "aspect-[2/3]",
    "aspect-[9/16]",
    "aspect-[5/6]",
    "aspect-[7/9]",
    "aspect-[10/13]",
  ]

  const stableIndex = (id: string) => {
    // deterministic small hash for stable visual layout
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
    return hash
  }

  const getTotalTime = (recipe: Recipe) => (recipe.prep_time || 0) + (recipe.cook_time || 0)

  const handleTileClick = (recipe: Recipe, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-favorite-button]") || target.closest("[data-open-button]")) {
      return
    }

    const isTouch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches
    if (isTouch) {
      const now = Date.now()
      const isDoubleTap = lastTapRef.current.id === recipe.id && now - lastTapRef.current.ts < 275
      lastTapRef.current = { id: recipe.id, ts: now }

      if (isDoubleTap) {
        setExpandedRecipeId(null)
        onRecipeClick(recipe.id)
        return
      }

      setExpandedRecipeId((prev) => (prev === recipe.id ? null : recipe.id))
      return
    }

    onRecipeClick(recipe.id)
  }

  return (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-3 md:gap-4">
      {recipes.map((recipe: Recipe, idx: number) => (
        <article
          key={recipe.id}
          id={idx === 0 ? "tutorial-recipe-card" : undefined}
          className="relative mb-3 md:mb-4 break-inside-avoid"
          data-tutorial={idx === 0 ? "recipe-card" : undefined}
          role="link"
          aria-label={`Open recipe ${recipe.title}`}
          tabIndex={0}
          onClick={(e) => handleTileClick(recipe, e)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onRecipeClick(recipe.id)
            }
          }}
        >
          <div
            className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm ${
              aspectClasses[stableIndex(recipe.id) % aspectClasses.length]
            }`}
          >
            <Image
              src={getRecipeImageUrl(recipe.content?.image_url || recipe.image_url) || "/placeholder.svg"}
              alt={recipe.title}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-300 md:group-hover:scale-[1.03]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

            <button
              type="button"
              data-favorite-button
              aria-label={favorites.has(recipe.id) ? "Remove from favorites" : "Add to favorites"}
              onClick={(e) => {
                // Ensure tapping the favorite never triggers tile expansion.
                e.preventDefault()
                e.stopPropagation()
                void onFavoriteToggle(recipe.id, e)
              }}
              className={`absolute right-2 top-2 z-10 pointer-events-auto rounded-full p-2 backdrop-blur-sm transition ${
                favorites.has(recipe.id)
                  ? "bg-black/45 text-red-400"
                  : "bg-black/35 text-white/90 hover:text-white"
              }`}
            >
              <Heart className={`h-4 w-4 ${favorites.has(recipe.id) ? "fill-current" : ""}`} />
            </button>

            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <p className="line-clamp-2 text-sm font-medium leading-tight text-white drop-shadow">
                {recipe.title}
              </p>
            </div>

            <div
              className={`absolute inset-0 z-[6] flex flex-col justify-end bg-black/75 p-3 text-white transition ${
                expandedRecipeId === recipe.id
                  ? "opacity-100"
                  : "opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="line-clamp-1 text-sm font-semibold">{recipe.title}</h3>
              </div>

              {recipe.content?.description && (
                <p className="mb-2 line-clamp-3 text-xs text-white/85">{recipe.content.description}</p>
              )}

              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-white/90">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {getTotalTime(recipe)}m
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {recipe.servings}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {(recipe.rating_avg || 0).toFixed(1)}
                </span>
                {recipe.tags?.[0] && (
                  <Badge variant="secondary" className="h-5 bg-white/15 text-[10px] text-white border-white/20">
                    {formatDietaryTag(recipe.tags[0])}
                  </Badge>
                )}
              </div>

              {(recipe.nutrition?.calories ||
                recipe.nutrition?.protein ||
                recipe.nutrition?.carbs ||
                recipe.nutrition?.fat) && (
                <div className="mb-2 hidden md:block rounded-lg border border-white/10 bg-white/10 px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/90">
                    {recipe.nutrition?.calories !== undefined && (
                      <span className="inline-flex items-center gap-1">
                        <Flame className="h-3 w-3 text-orange-200" />
                        {recipe.nutrition.calories} cal
                      </span>
                    )}
                    {recipe.nutrition?.protein !== undefined && (
                      <span>
                        <span className="text-white/70">P</span> {recipe.nutrition.protein}g
                      </span>
                    )}
                    {recipe.nutrition?.carbs !== undefined && (
                      <span>
                        <span className="text-white/70">C</span> {recipe.nutrition.carbs}g
                      </span>
                    )}
                    {recipe.nutrition?.fat !== undefined && (
                      <span>
                        <span className="text-white/70">F</span> {recipe.nutrition.fat}g
                      </span>
                    )}
                  </div>
                </div>
              )}

              <Button
                size="sm"
                data-open-button
                className="h-8 w-full bg-white text-black hover:bg-white/90"
                onClick={() => onRecipeClick(recipe.id)}
              >
                View Recipe
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
})
