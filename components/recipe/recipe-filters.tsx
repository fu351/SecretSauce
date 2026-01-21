import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Heart } from "lucide-react"
import { CUISINE_TYPES, DIETARY_TAGS } from "@/lib/types/recipe/constants"
import { formatDietaryTag } from "@/lib/tag-formatter"
import type { SortBy } from "@/hooks"

export interface RecipeFiltersProps {
  selectedDifficulty: string
  onDifficultyChange: (value: string) => void
  selectedCuisine: string
  onCuisineChange: (value: string) => void
  selectedDiet: string
  onDietChange: (value: string) => void
  sortBy: SortBy
  onSortChange: (value: SortBy) => void
  showFavoritesOnly: boolean
  onFavoritesToggle: () => void
  onClearFilters: () => void
}

/**
 * Recipe filter controls including difficulty, cuisine, diet, sort, and favorites
 */
export function RecipeFilters({
  selectedDifficulty,
  onDifficultyChange,
  selectedCuisine,
  onCuisineChange,
  selectedDiet,
  onDietChange,
  sortBy,
  onSortChange,
  showFavoritesOnly,
  onFavoritesToggle,
  onClearFilters
}: RecipeFiltersProps) {
  const cuisineTypes = CUISINE_TYPES
  const dietaryTags = DIETARY_TAGS

  const formatCuisineName = (cuisine: string) => {
    return cuisine
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  return (
    <Card className="mb-8 bg-card backdrop-blur-sm shadow-lg" data-tutorial="recipe-filter">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Select value={selectedDifficulty} onValueChange={onDifficultyChange}>
            <SelectTrigger>
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedCuisine} onValueChange={onCuisineChange}>
            <SelectTrigger>
              <SelectValue placeholder="Cuisine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cuisines</SelectItem>
              {cuisineTypes.map((cuisine) => (
                <SelectItem key={cuisine} value={cuisine}>
                  {formatCuisineName(cuisine)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedDiet} onValueChange={onDietChange}>
            <SelectTrigger>
              <SelectValue placeholder="Diet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Diets</SelectItem>
              {dietaryTags.map((diet) => (
                <SelectItem key={diet} value={diet}>
                  {formatDietaryTag(diet)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger>
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Newest</SelectItem>
              <SelectItem value="rating_avg">Highest Rated</SelectItem>
              <SelectItem value="prep_time">Quickest</SelectItem>
              <SelectItem value="title">Alphabetical</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={showFavoritesOnly ? "default" : "outline"}
            onClick={onFavoritesToggle}
            className="flex items-center justify-center gap-2"
            aria-label={showFavoritesOnly ? "Show all recipes" : "Show favorites only"}
          >
            <Heart className={`h-4 w-4 ${showFavoritesOnly ? "fill-current" : ""}`} />
            <span className="hidden lg:inline">Favorites</span>
          </Button>

          <Button variant="outline" onClick={onClearFilters}>
            Clear Filters
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
