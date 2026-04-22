"use client"

import Image from "next/image"
import { Recipe } from "@/lib/types"
import { applyFallbackImageStyles, getDefaultImageFallback, getRecipeImageUrl, isDefaultImageFallback } from "@/lib/image-helper"
import { useTheme } from "@/contexts/theme-context"

/**
 * Matches the meal planner slot tile: same size and style so the drag
 * preview looks like the tile in the grid, not a larger/transparent card.
 */
export function DragPreviewCard({ recipe }: { recipe: Recipe }) {
  const { theme } = useTheme()
  const imageFallback = getDefaultImageFallback(theme)
  const imageUrl = recipe?.image_url ?? recipe?.content?.image_url
  const imageSrc = getRecipeImageUrl(imageUrl, theme) || imageFallback
  const isFallbackImage = isDefaultImageFallback(imageSrc)

  return (
    <div className="w-[140px] h-[120px] rounded-lg overflow-hidden shadow-sm bg-card pointer-events-none">
      <div className="relative w-full h-full">
        <Image
          src={imageSrc}
          alt={recipe.title}
          fill
          sizes="140px"
          className={isFallbackImage ? "object-contain p-3" : "object-cover"}
          onError={(event) => {
            const target = event.currentTarget as HTMLImageElement
            if (!target.src.includes(imageFallback)) {
              target.src = imageFallback
              applyFallbackImageStyles(target)
            }
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end p-2.5 bg-gradient-to-t from-black/80 to-transparent">
          <h4 className="font-semibold text-sm line-clamp-2 text-white w-full">
            {recipe.title}
          </h4>
        </div>
      </div>
    </div>
  )
}
