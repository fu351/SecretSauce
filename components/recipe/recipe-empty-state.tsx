import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DatabaseSetupNotice } from "@/components/shared/database-setup-notice"

export interface RecipeEmptyStateProps {
  hasNoRecipes: boolean
  searchTerm?: string
  onClearFilters?: () => void
}

/**
 * Empty state component for when no recipes are found
 */
export function RecipeEmptyState({
  hasNoRecipes,
  searchTerm,
  onClearFilters
}: RecipeEmptyStateProps) {
  return (
    <div className="space-y-6">
      {hasNoRecipes && <DatabaseSetupNotice />}
      <Card className="bg-card backdrop-blur-sm shadow-lg">
        <CardContent className="p-12 text-center">
          <h3 className="text-lg font-medium text-foreground mb-2">
            {hasNoRecipes ? "No recipes in database" : "No recipes found"}
          </h3>
          <p className="mb-6 text-muted-foreground">
            {hasNoRecipes
              ? "Set up your database to see recipes"
              : searchTerm
                ? `No recipes match "${searchTerm}". Try a different search term or adjust your filters.`
                : "Try adjusting your filters"}
          </p>
          {!hasNoRecipes && onClearFilters && (
            <Button variant="outline" onClick={onClearFilters}>
              Clear All Filters
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
