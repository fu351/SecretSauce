"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { SearchIcon, Plus, Store, ShoppingBag } from "lucide-react"
import type { GroceryItem } from "./store-types"

interface PriceSearchSectionProps {
  searchTerm: string
  setSearchTerm: (term: string) => void
  zipCode: string
  setZipCode: (code: string) => void
  loading: boolean
  searchResults: GroceryItem[]
  onSearch: () => void
  onAddResult: (item: GroceryItem) => void
  // Styling props
  cardBgClass: string
  textClass: string
  mutedTextClass: string
  buttonClass: string
  buttonOutlineClass: string
  theme: string
}

/**
 * Price search section component
 * Allows searching for items via API and adding them to the list
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
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSearch()
    }
  }

  return (
    <div className="space-y-6">
      {/* Search Controls */}
      <Card className={cardBgClass}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${textClass}`}>
            <SearchIcon className="h-5 w-5" />
            Search for Groceries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="search-term" className={textClass}>
                Item Name
              </Label>
              <Input
                id="search-term"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="e.g., Organic Honeycrisp Apples"
                onKeyDown={handleKeyDown}
                className={theme === "dark" ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip-code" className={textClass}>
                Zip Code
              </Label>
              <Input
                id="zip-code"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="ZIP"
                maxLength={5}
                className={theme === "dark" ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
              />
            </div>
            <Button onClick={onSearch} disabled={loading} className={buttonClass}>
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Searching...</span>
                </div>
              ) : (
                "Search"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Results Grid */}
      {searchResults.length > 0 && (
        <Card className={cardBgClass}>
          <CardHeader>
            <CardTitle className={`flex items-center justify-between ${textClass}`}>
              <span>Search Results</span>
              <span className={`text-sm font-normal ${mutedTextClass}`}>
                {searchResults.length} items found
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((item) => (
                <div
                  key={`${item.provider}-${item.id}`}
                  className={`flex flex-col rounded-lg border p-3 transition-all hover:shadow-md ${
                    theme === "dark" 
                      ? "bg-[#181813] border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40" 
                      : "bg-white border-gray-200 hover:border-orange-200"
                  }`}
                >
                  {/* Item Header (Image + Title) */}
                  <div className="flex gap-3 mb-3">
                    <div className="flex-shrink-0 w-16 h-16 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
                      {item.image_url ? (
                        <img 
                          src={item.image_url} 
                          alt={item.title} 
                          className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal" 
                        />
                      ) : (
                        <ShoppingBag className={`h-8 w-8 ${mutedTextClass} opacity-50`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-medium leading-tight mb-1 line-clamp-2 ${textClass}`}>
                        {item.title}
                      </h4>
                      <p className={`text-xs ${mutedTextClass}`}>
                        {item.brand || "Generic"}
                      </p>
                    </div>
                  </div>

                  {/* Item Details (Store + Price) */}
                  <div className="mt-auto pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <Store className={`h-3 w-3 ${mutedTextClass}`} />
                        <span className={`text-xs ${mutedTextClass}`}>{item.provider}</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-bold ${textClass}`}>
                          ${item.price.toFixed(2)}
                        </span>
                        {item.unit && (
                          <span className={`text-xs ${mutedTextClass} ml-1`}>
                            /{item.unit}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Button 
                      size="sm" 
                      onClick={() => onAddResult(item)}
                      className={`w-full h-8 ${buttonOutlineClass} hover:bg-orange-50 dark:hover:bg-orange-900/20`}
                    >
                      <Plus className="h-3 w-3 mr-1.5" />
                      Add to List
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}