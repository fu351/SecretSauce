import { Pagination } from "@/components/ui/pagination"

export interface RecipeResultsHeaderProps {
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  searchTerm?: string
  hasActiveFilters: boolean
  showPagination?: boolean
  showSummary?: boolean
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
  showPagination = true,
  showSummary = true,
  onPageChange
}: RecipeResultsHeaderProps) {
  return (
    <div className="mb-4 md:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {showSummary && (
        <p className="text-sm md:text-base text-muted-foreground">
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
      )}
      {showPagination && totalPages > 1 && (
        <div className="self-start sm:self-auto">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  )
}
