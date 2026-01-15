"use client"

import { Recipe } from "@/lib/types"
import { getRecipeImageUrl } from "@/lib/image-helper"

interface DragPreviewCardProps {
  recipe: Recipe
}

export function DragPreviewCard({ recipe }: DragPreviewCardProps) {
  return (
    <div className="w-64 rounded-lg overflow-hidden bg-card border border-border/20">
      {/* Image */}
      <div className="w-full h-40 bg-muted overflow-hidden">
        <img
          src={getRecipeImageUrl(recipe.image_url)}
          alt={recipe.title}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="font-semibold text-sm line-clamp-2 text-text mb-2">
          {recipe.title}
        </h3>

        {recipe.nutrition && (
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <div className="text-muted-foreground text-[10px]">CAL</div>
              <div className="font-semibold">{recipe.nutrition.calories || "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px]">FAT</div>
              <div className="font-semibold">{recipe.nutrition.fat ? `${recipe.nutrition.fat}g` : "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px]">PRO</div>
              <div className="font-semibold">{recipe.nutrition.protein ? `${recipe.nutrition.protein}g` : "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px]">CARB</div>
              <div className="font-semibold">{recipe.nutrition.carbs ? `${recipe.nutrition.carbs}g` : "-"}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
