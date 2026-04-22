import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Grid, List, Check, ThumbsUp, User, ChevronDown, FolderOpen } from "lucide-react"
import { CUISINE_TYPES, DIETARY_TAGS } from "@/lib/types/recipe/constants"
import { formatDietaryTag } from "@/lib/tag-formatter"
import type { SortBy } from "@/hooks"
import type { RecipeCollectionWithCount } from "@/lib/database/recipe-favorites-db"

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
  selectedCollectionId: string | null
  onCollectionChange: (collectionId: string | null) => void
  collections?: RecipeCollectionWithCount[]
  onClearFilters: () => void
  showSearchControls?: boolean
  showSortControls?: boolean
  idPrefix?: string
  flatContainer?: boolean
  showInlineClearButton?: boolean
}

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "created_at", label: "Newest" },
  { value: "rating_avg", label: "Top Rated" },
  { value: "prep_time", label: "Quickest" },
  { value: "title", label: "A-Z" },
]

const DIFFICULTY_OPTIONS = [
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
  selectedCollectionId,
  onCollectionChange,
  collections = [],
  onClearFilters,
  showSearchControls = true,
  showSortControls = true,
  idPrefix = "recipe-filter",
  flatContainer = false,
  showInlineClearButton = true,
}: RecipeFilterSidebarProps) {
  const [collapsedSections, setCollapsedSections] = useState({
    sort: false,
    personal: false,
    collections: false,
    difficulty: false,
    cuisine: false,
    dietary: false,
  })

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

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const sectionHeaderClass =
    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40"

  return (
    <div className="lg:sticky lg:top-6" data-tutorial="recipe-filter">
      <div
        className={
          flatContainer
            ? "overscroll-contain"
            : "max-h-[calc(100dvh-8.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain rounded-2xl border bg-card shadow-sm"
        }
        data-tutorial="recipe-filter-scroll"
      >
        {showSearchControls && (
          <div className="sticky top-0 z-10 space-y-3 border-b bg-card/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/85">
            <div className="relative" data-tutorial="recipe-search">
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
        )}

        <div className={flatContainer ? "space-y-5 px-4 pt-4 pb-8" : "space-y-5 p-4"}>
          {showSortControls && (
            <div id={`${idPrefix}-sort`} className="space-y-3">
              <button type="button" className={sectionHeaderClass} onClick={() => toggleSection("sort")}>
                <span>Sort By</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${collapsedSections.sort ? "-rotate-90" : ""}`} />
              </button>
              {!collapsedSections.sort && <div className="space-y-1">
                {SORT_OPTIONS.map((option) => (
                  <ChecklistItem
                    key={option.value}
                    label={option.label}
                    selected={sortBy === option.value}
                    onClick={() => onSortChange(option.value)}
                  />
                ))}
              </div>}
            </div>
          )}

          <div id={`${idPrefix}-personal`} className="border-t pt-4 space-y-3">
            <button type="button" className={sectionHeaderClass} onClick={() => toggleSection("personal")}>
              <span>Personal</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsedSections.personal ? "-rotate-90" : ""}`} />
            </button>
            {!collapsedSections.personal && <div className="space-y-1">
              <button
                type="button"
                onClick={onFavoritesToggle}
                aria-pressed={showFavoritesOnly}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm transition ${
                  showFavoritesOnly ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <span className="flex items-center gap-2">
                  <ThumbsUp className={`h-4 w-4 ${showFavoritesOnly ? "fill-current" : ""}`} />
                  Liked
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

              <div className="pt-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
                  onClick={() => toggleSection("collections")}
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Collections
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${collapsedSections.collections ? "-rotate-90" : ""}`} />
                </button>

                {!collapsedSections.collections && (
                  <div className="mt-2 space-y-1 pl-1">
                    {collections.map((collection) => (
                      <ChecklistItem
                        key={collection.id}
                        label={collection.name}
                        selected={selectedCollectionId === collection.id}
                        onClick={() => onCollectionChange(collection.id)}
                      />
                    ))}
                    {collections.length === 0 && (
                      <p className="px-2 py-1 text-xs text-muted-foreground">
                        Create a folder on a recipe page to filter by it here.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>}
          </div>

          <div
            id={`${idPrefix}-difficulty`}
            className="border-t pt-4 space-y-3"
            data-tutorial="recipe-filter-difficulty"
          >
            <button type="button" className={sectionHeaderClass} onClick={() => toggleSection("difficulty")}>
              <span>Difficulty</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsedSections.difficulty ? "-rotate-90" : ""}`} />
            </button>
            {!collapsedSections.difficulty && <div className="space-y-1">
              {DIFFICULTY_OPTIONS.map((option) => (
                <ChecklistItem
                  key={option.value}
                  label={option.label}
                  selected={selectedDifficulty === option.value}
                  onClick={() =>
                    onDifficultyChange(selectedDifficulty === option.value ? "all" : option.value)
                  }
                />
              ))}
            </div>}
          </div>

          <div
            id={`${idPrefix}-cuisine`}
            className="border-t pt-4 space-y-3"
            data-tutorial="recipe-filter-cuisine"
          >
            <button type="button" className={sectionHeaderClass} onClick={() => toggleSection("cuisine")}>
              <span>Cuisine</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsedSections.cuisine ? "-rotate-90" : ""}`} />
            </button>
            {!collapsedSections.cuisine && <div className="space-y-1 pr-1">
              {CUISINE_TYPES.map((cuisine) => (
                <ChecklistItem
                  key={cuisine}
                  label={formatCuisineName(cuisine)}
                  selected={selectedCuisine === cuisine}
                  onClick={() => onCuisineChange(selectedCuisine === cuisine ? "all" : cuisine)}
                />
              ))}
            </div>}
          </div>

          <div
            id={`${idPrefix}-dietary`}
            className="border-t pt-4 space-y-3"
            data-tutorial="recipe-filter-dietary"
          >
            <button type="button" className={sectionHeaderClass} onClick={() => toggleSection("dietary")}>
              <span>Dietary</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsedSections.dietary ? "-rotate-90" : ""}`} />
            </button>
            {!collapsedSections.dietary && <div className="space-y-1 pr-1">
              {DIETARY_TAGS.map((diet) => (
                <ChecklistItem
                  key={diet}
                  label={formatDietaryTag(diet)}
                  selected={selectedDiet.includes(diet)}
                  onClick={() => toggleDiet(diet)}
                />
              ))}
            </div>}
          </div>

          {showInlineClearButton && (
            <div className="border-t pt-4">
              <Button variant="outline" size="sm" onClick={onClearFilters} className="w-full">
                Clear Filters
              </Button>
            </div>
          )}
          {flatContainer && <div aria-hidden className="h-8" />}
        </div>
      </div>
    </div>
  )
}
