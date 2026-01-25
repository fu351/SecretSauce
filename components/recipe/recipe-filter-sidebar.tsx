import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Grid, List, Check, Heart, User } from "lucide-react"
import { CUISINE_TYPES, DIETARY_TAGS } from "@/lib/types/recipe/constants"
import { formatDietaryTag } from "@/lib/tag-formatter"
import type { SortBy } from "@/hooks"

interface ChecklistItemProps {
  label: string
  selected: boolean
  onClick: () => void
}

function ChecklistItem({ label, selected, onClick }: ChecklistItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm transition ${
        selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
      }`}
    >
      <span className="truncate">{label}</span>
      {selected ? <Check className="h-4 w-4 text-foreground" /> : <span className="h-4 w-4" />}
    </button>
  )
}

interface RecipeFilterSidebarProps {
  searchInput: string
  onSearchInputChange: (value: string) => void
  onSearch: () => void
  viewMode: "tile" | "details"
  onViewModeChange: (mode: "tile" | "details") => void
  selectedDifficulty: string
  onDifficultyChange: (value: string) => void
  selectedCuisine: string
  onCuisineChange: (value: string) => void
  selectedDiet: string[]
  onDietChange: (value: string[]) => void
  sortBy: SortBy
  onSortChange: (value: SortBy) => void
  showFavoritesOnly: boolean
  onFavoritesToggle: () => void
  showUserOnly: boolean
  onUserRecipesToggle: () => void
  onClearFilters: () => void
}

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "created_at", label: "Newest" },
  { value: "rating_avg", label: "Top Rated" },
  { value: "prep_time", label: "Quickest" },
  { value: "title", label: "A-Z" },
]

const DIFFICULTY_OPTIONS = [
  { value: "all", label: "All Levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
]

const formatCuisineName = (cuisine: string) =>
  cuisine
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

export function RecipeFilterSidebar({
  searchInput,
  onSearchInputChange,
  onSearch,
  viewMode,
  onViewModeChange,
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
  showUserOnly,
  onUserRecipesToggle,
  onClearFilters,
}: RecipeFilterSidebarProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSearch()
    }
  }

  const toggleDiet = (diet: string) => {
    const next = selectedDiet.includes(diet)
      ? selectedDiet.filter((item) => item !== diet)
      : [...selectedDiet, diet]
    onDietChange(next)
  }

  return (
    <div className="sticky top-6">
      <div className="rounded-2xl border bg-card shadow-sm p-4 space-y-5">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search recipes..."
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9 h-10 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "tile" ? "default" : "outline"}
              size="sm"
              onClick={() => onViewModeChange("tile")}
              className="flex-1"
            >
              <Grid className="h-4 w-4 mr-1" />
              Tiles
            </Button>
            <Button
              variant={viewMode === "details" ? "default" : "outline"}
              size="sm"
              onClick={() => onViewModeChange("details")}
              className="flex-1"
            >
              <List className="h-4 w-4 mr-1" />
              Details
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={onSearch} className="w-full">
            Search
          </Button>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort By</h4>
          <div className="space-y-1">
            {SORT_OPTIONS.map((option) => (
              <ChecklistItem
                key={option.value}
                label={option.label}
                selected={sortBy === option.value}
                onClick={() => onSortChange(option.value)}
              />
            ))}
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal</h4>
          <div className="space-y-1">
            <button
              type="button"
              onClick={onFavoritesToggle}
              aria-pressed={showFavoritesOnly}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm transition ${
                showFavoritesOnly ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <Heart className={`h-4 w-4 ${showFavoritesOnly ? "fill-current" : ""}`} />
                Favorites
              </span>
              {showFavoritesOnly ? <Check className="h-4 w-4 text-foreground" /> : <span className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onUserRecipesToggle}
              aria-pressed={showUserOnly}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm transition ${
                showUserOnly ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <User className="h-4 w-4" />
                My Recipes
              </span>
              {showUserOnly ? <Check className="h-4 w-4 text-foreground" /> : <span className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Difficulty</h4>
          <div className="space-y-1">
            {DIFFICULTY_OPTIONS.map((option) => (
              <ChecklistItem
                key={option.value}
                label={option.label}
                selected={selectedDifficulty === option.value}
                onClick={() => onDifficultyChange(option.value)}
              />
            ))}
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cuisine</h4>
          <div className="space-y-1 max-h-40 overflow-auto pr-1">
            <ChecklistItem
              label="All Cuisines"
              selected={selectedCuisine === "all"}
              onClick={() => onCuisineChange("all")}
            />
            {CUISINE_TYPES.map((cuisine) => (
              <ChecklistItem
                key={cuisine}
                label={formatCuisineName(cuisine)}
                selected={selectedCuisine === cuisine}
                onClick={() => onCuisineChange(cuisine)}
              />
            ))}
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dietary</h4>
          <div className="space-y-1 max-h-40 overflow-auto pr-1">
            <ChecklistItem
              label="Any Diet"
              selected={selectedDiet.length === 0}
              onClick={() => onDietChange([])}
            />
            {DIETARY_TAGS.map((diet) => (
              <ChecklistItem
                key={diet}
                label={formatDietaryTag(diet)}
                selected={selectedDiet.includes(diet)}
                onClick={() => toggleDiet(diet)}
              />
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <Button variant="outline" size="sm" onClick={onClearFilters} className="w-full">
            Clear Filters
          </Button>
        </div>
      </div>
    </div>
  )
}
