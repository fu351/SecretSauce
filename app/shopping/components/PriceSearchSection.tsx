"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { SearchIcon } from "lucide-react"
import type { GroceryItem } from "../hooks/useShoppingList"

interface PriceSearchSectionProps {
  searchTerm: string
  setSearchTerm: (term: string) => void
  zipCode: string
  setZipCode: (code: string) => void
  loading: boolean
  searchResults: GroceryItem[]
  onSearch: () => void
  onAddResult: (item: GroceryItem) => void
  cardBgClass: string
  textClass: string
  mutedTextClass: string
  buttonClass: string
  buttonOutlineClass: string
  theme: string
}

/**
 * Price search section component
 * Shows only when there's exactly 1 item in the shopping list
 * Allows searching for price alternatives for that single item
 */
export function PriceSearchSection({
  searchTerm,
  setSearchTerm,
  zipCode,
  setZipCode,
  loading,
  searchResults,
  onSearch,
  onAddResult,
  cardBgClass,
  textClass,
  mutedTextClass,
  buttonClass,
  buttonOutlineClass,
  theme,
}: PriceSearchSectionProps) {
  return (
    <div className="space-y-6">
      <Card className={cardBgClass}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${textClass}`}>
            <SearchIcon className="h-5 w-5" />
            Search for Groceries
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="search-term" className={textClass}>
                Search Term
              </Label>
              <Input
                id="search-term"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="e.g., apples, milk, bread"
                onKeyPress={(e) => e.key === "Enter" && onSearch()}
                className={theme === "dark" ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
              />
            </div>
            <div>
              <Label htmlFor="zip-code" className={textClass}>
                Zip Code
              </Label>
              <Input
                id="zip-code"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="47906"
                className={theme === "dark" ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={onSearch} disabled={loading} className={`w-full ${buttonClass}`}>
                {loading ? "Searching..." : "Search"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search results carousel would go here - kept minimal for extraction demo */}
      {searchResults.length > 0 && (
        <Card className={cardBgClass}>
          <CardHeader>
            <CardTitle className={textClass}>Search Results ({searchResults.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={mutedTextClass}>Carousel results would be rendered here</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
