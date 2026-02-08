import Image from "next/image"
import { Recipe } from "@/lib/types"
import { getRecipeImageUrl } from "@/lib/image-helper"

/**
 * Matches the meal planner slot tile: same size and style so the drag
 * preview looks like the tile in the grid, not a larger/transparent card.
 */
export function DragPreviewCard({ recipe }: { recipe: Recipe }) {
  const imageUrl = recipe?.image_url ?? recipe?.content?.image_url

  return (
    <div className="w-[140px] h-[120px] rounded-lg overflow-hidden shadow-sm bg-card pointer-events-none">
      <div className="relative w-full h-full">
        <Image
          src={getRecipeImageUrl(imageUrl) || "/placeholder.svg"}
          alt={recipe.title}
          fill
          sizes="140px"
          className="object-cover"
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
