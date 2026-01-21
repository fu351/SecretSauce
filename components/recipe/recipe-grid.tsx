import { memo } from "react"
import { RecipeCard } from "@/components/recipe/cards/recipe-card"
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {recipes.map((recipe: Recipe, idx: number) => (
        <div
          key={recipe.id}
          id={idx === 0 ? "tutorial-recipe-card" : undefined}
          className="relative h-full"
          data-tutorial={idx === 0 ? "recipe-card" : undefined}
          role="link"
          tabIndex={0}
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.closest("[data-favorite-button]")) return
            onRecipeClick(recipe.id)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              const target = e.target as HTMLElement
              if (target.closest("[data-favorite-button]")) {
                e.preventDefault()
                e.stopPropagation()
              }
              onRecipeClick(recipe.id)
            }
          }}
        >
          <RecipeCard
            id={recipe.id}
            title={recipe.title}
            content={recipe.content}
            rating_avg={recipe.rating_avg || 0}
            difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
            comments={recipe.rating_count || 0}
            tags={recipe.tags}
            nutrition={recipe.nutrition}
            initialIsFavorited={favorites.has(recipe.id)}
            skipFavoriteCheck
            onFavoriteChange={(id, isFav) => onFavoriteToggle(id)}
          />
        </div>
      ))}
    </div>
  )
})
