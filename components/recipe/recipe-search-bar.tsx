import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Grid, List } from "lucide-react"

export interface RecipeSearchBarProps {
  searchInput: string
  onSearchInputChange: (value: string) => void
  onSearch: () => void
  viewMode: "tile" | "details"
  onViewModeChange: (mode: "tile" | "details") => void
}

/**
 * Recipe search bar with search input and view mode toggle
 */
export function RecipeSearchBar({
  searchInput,
  onSearchInputChange,
  onSearch,
  viewMode,
  onViewModeChange
}: RecipeSearchBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSearch()
    }
  }

  return (
    <div className="relative flex gap-2 items-center mb-8" data-tutorial="recipe-search">
      <div className="relative flex-1 max-w-2xl">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
        <Input
          placeholder="Search recipes by name, ingredient, or cuisine..."
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-12 py-4 text-lg rounded-full shadow-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant={viewMode === "tile" ? "default" : "outline"}
          size="sm"
          onClick={() => onViewModeChange("tile")}
        >
          <Grid className="h-4 w-4 mr-1" />
          Tiles
        </Button>
        <Button
          variant={viewMode === "details" ? "default" : "outline"}
          size="sm"
          onClick={() => onViewModeChange("details")}
        >
          <List className="h-4 w-4 mr-1" />
          Details
        </Button>
      </div>
    </div>
  )
}
