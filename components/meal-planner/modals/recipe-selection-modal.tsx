"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Heart } from "lucide-react"
import type { Recipe } from "@/lib/types"

interface RecipeSelectionModalProps {
  open: boolean
  onClose: () => void
  mealType: string | null
  date: string | null
  favoriteRecipes: Recipe[]
  suggestedRecipes: Recipe[]
  mealTypes: Array<{ key: string; label: string }>
  onSelect: (recipe: Recipe) => void
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function RecipeSelectionModal({
  open,
  onClose,
  mealType,
  date,
  favoriteRecipes,
  suggestedRecipes,
  mealTypes,
  onSelect,
}: RecipeSelectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mealType && date && (
              <>
                Select Recipe for {mealTypes.find((m) => m.key === mealType)?.label} on {formatDate(date)}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {favoriteRecipes.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Heart className="w-5 h-5 text-destructive" />
                <h3 className="text-lg font-semibold">Favorites ({favoriteRecipes.length})</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {favoriteRecipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="group relative cursor-pointer rounded-lg border border-border hover:border-primary transition-colors"
                    onClick={() => {
                      onSelect(recipe)
                      onClose()
                    }}
                  >
                    <img
                      src={recipe.image_url || "/placeholder.svg?height=120&width=180"}
                      alt={recipe.title}
                      className="w-full h-24 object-cover rounded-t-lg"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                      <p className="text-white text-sm opacity-0 group-hover:opacity-100 text-center px-2 font-medium">
                        Add to Plan
                      </p>
                    </div>
                    <div className="p-2">
                      <p className="text-xs line-clamp-2">{recipe.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-lg font-semibold mb-4">Suggested Recipes</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {suggestedRecipes.slice(0, 12).map((recipe) => (
                <div
                  key={recipe.id}
                  className="group relative cursor-pointer rounded-lg border border-border hover:border-primary transition-colors"
                  onClick={() => {
                    onSelect(recipe)
                    onClose()
                  }}
                >
                  <img
                    src={recipe.image_url || "/placeholder.svg?height=120&width=180"}
                    alt={recipe.title}
                    className="w-full h-24 object-cover rounded-t-lg"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                    <p className="text-white text-sm opacity-0 group-hover:opacity-100 text-center px-2 font-medium">
                      Add to Plan
                    </p>
                  </div>
                  <div className="p-2">
                    <p className="text-xs line-clamp-2">{recipe.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
