import Image from "next/image"
import { Recipe } from "@/lib/types"
import { getRecipeImageUrl } from "@/lib/image-helper"

export function DragPreviewCard({ recipe }: { recipe: Recipe }) {
  return (
    <div className="w-64 rounded-lg overflow-hidden bg-card border border-border/20">
      <div className="relative w-full h-40 bg-muted overflow-hidden">
        <Image
          src={getRecipeImageUrl(recipe.content?.image_url) || "/placeholder.svg"}
          alt={recipe.title}
          fill
          sizes="256px"
          className="object-cover"
          loading="lazy"
        />
      </div>

      <div className="p-3">
        <h3 className="font-semibold text-sm line-clamp-2 text-foreground">
          {recipe.title}
        </h3>
      </div>
    </div>
  )
}
