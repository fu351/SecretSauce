import { Pagination } from "@/components/ui/pagination"

export interface RecipeResultsHeaderProps {
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  searchTerm?: string
  hasActiveFilters: boolean
  onPageChange: (page: number) => void
}

/**
 * Recipe results header with count text and top pagination
 */
export function RecipeResultsHeader({
  totalCount,
  page,
  pageSize,
  totalPages,
  searchTerm,
  hasActiveFilters,
  onPageChange
}: RecipeResultsHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <p className="text-muted-foreground">
        {searchTerm && `Search results for "${searchTerm}" - `}
        {totalCount > 0 ? (
          <>
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount} recipe{totalCount !== 1 ? 's' : ''}
          </>
        ) : (
          <>Showing 0 recipes</>
        )}
        {hasActiveFilters && " (filtered)"}
      </p>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}
    </div>
  )
}
