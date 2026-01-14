"use client"

import { Button } from "@/components/ui/button"
import { Heart } from "lucide-react"
import { useRouter } from "next/navigation"
import type { Recipe } from "@/lib/types"

interface FavoriteRecipesSectionProps {
  recipes: Recipe[]
  onDragStart: (recipe: Recipe) => void
  onClick: (recipe: Recipe) => void
  isMobile: boolean
}

export function FavoriteRecipesSection({ recipes, onDragStart, onClick, isMobile }: FavoriteRecipesSectionProps) {
  const router = useRouter()

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-base md:text-lg font-semibold flex items-center gap-2 text-text`}>
          <Heart className="w-4 h-4 md:w-5 md:h-5 text-destructive" />
          Favorites ({recipes.length})
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-2 md:gap-3">
        {recipes.slice(0, 6).map((recipe) => (
          <div
            key={recipe.id}
            className="group relative cursor-pointer"
            draggable={!isMobile}
            onDragStart={() => !isMobile && onDragStart(recipe)}
            onClick={() => isMobile && onClick(recipe)}
          >
            <img
              src={recipe.image_url || "/placeholder.svg?height=100&width=150"}
              alt={recipe.title}
              className="w-full h-20 md:h-24 object-cover rounded-lg"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
              <p className="text-white text-xs opacity-0 group-hover:opacity-100 text-center px-2">
                {isMobile ? "Tap to add" : "Drag to add"}
              </p>
            </div>
            <p className={`text-xs mt-1 line-clamp-2 text-text`}>{recipe.title}</p>
          </div>
        ))}
      </div>
      {recipes.length === 0 && (
        <div className="text-center py-6 md:py-8">
          <p className={`text-muted-foreground text-sm mb-3`}>No favorites yet</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/recipes")}
            className="border-border text-text hover:bg-accent hover:text-accent-foreground"
          >
            Browse Recipes
          </Button>
        </div>
      )}
    </section>
  )
}
