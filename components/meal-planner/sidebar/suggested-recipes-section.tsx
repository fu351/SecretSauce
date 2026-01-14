"use client"

import type { Recipe } from "@/lib/types"

interface SuggestedRecipesSectionProps {
  recipes: Recipe[]
  onDragStart: (recipe: Recipe) => void
  onClick: (recipe: Recipe) => void
  isMobile: boolean
}

export function SuggestedRecipesSection({ recipes, onDragStart, onClick, isMobile }: SuggestedRecipesSectionProps) {
  return (
    <section>
      <h3 className={`text-base md:text-lg font-semibold mb-4 text-text`}>Suggested Recipes</h3>
      <div className="grid grid-cols-2 gap-2 md:gap-3">
        {recipes.slice(0, 20).map((recipe) => (
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
    </section>
  )
}
