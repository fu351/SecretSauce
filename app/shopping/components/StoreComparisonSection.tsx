"use client"

import { Card, CardContent } from "@/components/ui/card"
import { DollarSign } from "lucide-react"
import { StoreMap } from "@/components/store-map"
import type { StoreComparison, ShoppingListItem } from "../hooks/useShoppingList"

interface StoreComparisonSectionProps {
  comparisonLoading: boolean
  massSearchResults: StoreComparison[]
  carouselIndex: number
  onCarouselNext: () => void
  onCarouselPrev: () => void
  onStoreSelect: (index: number) => void
  zipCode: string
  cardBgClass: string
  textClass: string
  mutedTextClass: string
  buttonOutlineClass: string
  buttonClass: string
  theme: string
}

/**
 * Store comparison section with carousel and map
 * Shows side-by-side price comparison across stores with map visualization
 */
export function StoreComparisonSection({
  comparisonLoading,
  massSearchResults,
  carouselIndex,
  onCarouselNext,
  onCarouselPrev,
  onStoreSelect,
  zipCode,
  cardBgClass,
  textClass,
  mutedTextClass,
  buttonOutlineClass,
  buttonClass,
  theme,
}: StoreComparisonSectionProps) {
  if (comparisonLoading) {
    return (
      <Card className={cardBgClass}>
        <CardContent className="p-8 text-center">
          <div
            className={`animate-spin rounded-full h-8 w-8 border-b-2 ${
              theme === "dark" ? "border-[#e8dcc4]" : "border-orange-500"
            } mx-auto mb-4`}
          ></div>
          <p className={textClass}>Searching all stores...</p>
        </CardContent>
      </Card>
    )
  }

  if (massSearchResults.length === 0) {
    return (
      <Card className={cardBgClass}>
        <CardContent className="p-8 text-center">
          <DollarSign className={`h-12 w-12 ${mutedTextClass} mx-auto mb-4`} />
          <h3 className={`text-lg font-medium ${textClass} mb-2`}>No comparison data</h3>
          <p className={mutedTextClass}>
            Add items to your shopping list and perform a search to see store comparisons.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Carousel and Map Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Carousel Section */}
        <div className="relative min-w-0">
          <h2 className={`text-2xl font-bold ${textClass} mb-4`}>Store Comparison</h2>
          <p className={mutedTextClass}>
            Carousel with {massSearchResults.length} stores would render here
          </p>
        </div>

        {/* Map Section */}
        <div className="space-y-4 min-w-0">
          <div>
            <h2 className={`text-2xl font-bold ${textClass} mb-2`}>Store Locations</h2>
            <p className={mutedTextClass}>Click markers to sync with the carousel</p>
          </div>
          <StoreMap
            comparisons={massSearchResults}
            userPostalCode={zipCode}
            selectedStoreIndex={carouselIndex}
            onStoreSelected={onStoreSelect}
          />
        </div>
      </div>

      {/* Info Card */}
      <Card className={cardBgClass}>
        <CardContent className="p-4">
          <p className={mutedTextClass}>
            The full carousel component with item details, missing items, and price breakdown would
            render here in production.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
