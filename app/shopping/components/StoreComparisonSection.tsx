"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle, 
  RotateCcw, 
  ShoppingCart,
  ExternalLink,
  ArrowLeftRight,
  Search
} from "lucide-react"

import type { StoreComparison } from "./store-types" 

interface StoreComparisonSectionProps {
  comparisonLoading: boolean
  massSearchResults: StoreComparison[]
  carouselIndex: number
  onCarouselNext: () => void
  onCarouselPrev: () => void
  onStoreSelect: (index: number) => void
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
  carouselRef: React.RefObject<HTMLDivElement>
  onReloadItem: (params: { term: string; store: string; shoppingListId: string }) => void 
  zipCode: string
  bgClass: string
  cardBgClass: string
  textClass: string
  mutedTextClass: string
  buttonClass: string
  buttonOutlineClass: string
  theme: "light" | "dark"
}

export function StoreComparisonSection({
  comparisonLoading,
  massSearchResults,
  carouselIndex,
  onCarouselNext,
  onCarouselPrev,
  onScroll,
  carouselRef,
  onReloadItem,
  cardBgClass,
  textClass,
  mutedTextClass,
  buttonClass,
  theme,
}: StoreComparisonSectionProps) {
  
  const bestValueIndex = React.useMemo(() => {
    if (!massSearchResults || massSearchResults.length === 0) return -1
    let bestIdx = -1
    let minScore = Infinity

    massSearchResults.forEach((store, idx) => {
       const missingCount = store.missingIngredients ? store.missingIngredients.length : 0
       const penalty = missingCount * 20 
       const score = store.total + penalty
       if (score < minScore) {
         minScore = score
         bestIdx = idx
       }
    })
    return bestIdx
  }, [massSearchResults])

  if ((!massSearchResults || massSearchResults.length === 0) && !comparisonLoading) {
    return <div className={`text-center py-10 ${mutedTextClass}`}>No stores found in this area.</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <h3 className={`font-medium text-sm flex items-center gap-2 ${textClass}`}>
          <Search className="h-4 w-4" />
          Found {massSearchResults.length} Options
        </h3>
        <div className="hidden sm:flex gap-2">
           <Button variant="outline" size="icon" onClick={onCarouselPrev} disabled={carouselIndex === 0} className={`h-8 w-8 ${theme === 'dark' ? "border-[#e8dcc4]/20" : ""}`}>
             <ChevronLeft className="h-4 w-4" />
           </Button>
           <Button variant="outline" size="icon" onClick={onCarouselNext} disabled={carouselIndex === massSearchResults.length - 1} className={`h-8 w-8 ${theme === 'dark' ? "border-[#e8dcc4]/20" : ""}`}>
             <ChevronRight className="h-4 w-4" />
           </Button>
        </div>
      </div>

      {/* Main Carousel */}
      <div className="relative group">
        <div
          ref={carouselRef}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4 px-4 sm:px-1 space-x-4"
          style={{ scrollBehavior: "smooth" }}
        >
          {massSearchResults.map((result, index) => {
            const isBestValue = index === bestValueIndex
            const missingCount = result.missingIngredients ? result.missingIngredients.length : 0
            const foundCount = result.items.length
            const totalCount = foundCount + missingCount
            const percentFound = totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0
            
            return (
              <div key={`${result.store}-${index}`} className="flex-shrink-0 w-[85vw] sm:w-[350px] md:w-[400px] snap-center">
                <Card className={`flex flex-col h-[65vh] min-h-[500px] ${cardBgClass} border-2 transition-all ${
                    index === carouselIndex ? "border-green-500 shadow-md shadow-green-500/5" : theme === 'dark' ? "border-[#e8dcc4]/10" : "border-gray-200"
                  }`}>
                  
                  <CardHeader className="pb-3 border-b border-gray-100 dark:border-[#e8dcc4]/10 flex-shrink-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className={`text-lg md:text-xl ${textClass} flex items-center gap-2 truncate max-w-[180px]`}>
                          {result.store}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                           <Badge variant="secondary" className={`text-[10px] px-1.5 ${percentFound === 100 ? 'text-green-600 bg-green-50' : 'text-amber-600 bg-amber-50'}`}>
                             {percentFound}% Match
                           </Badge>
                           {isBestValue && <Badge className="text-[10px] px-1.5 bg-green-600">Best Value</Badge>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl md:text-3xl font-bold ${textClass}`}>${result.total.toFixed(2)}</div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                    <div className="flex-1 overflow-y-auto">
                      
                      {/* FOUND ITEMS */}
                      <div className="p-3 space-y-2">
                         {result.items.map((item, i) => (
                           <div key={`${item.id}-${i}`} className="flex items-center gap-3 group relative pr-10 py-1">
                              <div className={`w-10 h-10 rounded border flex-shrink-0 flex items-center justify-center bg-white overflow-hidden ${theme === 'dark' ? "border-[#e8dcc4]/20" : "border-gray-100"}`}>
                                {item.image_url ? (
                                  <img src={item.image_url} alt={item.title} className="w-full h-full object-contain" />
                                ) : (
                                  <ShoppingCart className="h-4 w-4 text-gray-300" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${textClass}`}>{item.title}</p>
                                <div className="flex justify-between text-xs">
                                   <span className={mutedTextClass}>{item.brand || 'Generic'}</span>
                                   
                                   {/* UPDATED: Quantity Display */}
                                   <div className="flex items-center gap-1">
                                      {item.quantity && item.quantity > 1 && (
                                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-gray-300 text-gray-500">
                                          {item.quantity}×
                                        </Badge>
                                      )}
                                      <span className={`font-medium ${textClass}`}>${item.price.toFixed(2)}</span>
                                   </div>
                                </div>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="absolute right-0 h-10 w-10 text-gray-400 active:text-blue-500 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                title={`Swap "${item.originalName}"`}
                                onClick={() => onReloadItem({ 
                                  term: item.originalName, 
                                  store: result.store,
                                  shoppingListId: item.shoppingItemId 
                                })}
                              >
                                <ArrowLeftRight className="h-5 w-5" />
                              </Button>
                           </div>
                         ))}
                      </div>

                      {/* MISSING ITEMS */}
                      {missingCount > 0 && result.missingIngredients && (
                        <div className="bg-amber-50/50 dark:bg-amber-900/10 border-t border-dashed border-amber-200 dark:border-amber-800">
                          <div className="px-4 py-2 bg-amber-100/50 dark:bg-amber-900/20 flex items-center gap-2">
                             <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                             <span className="text-xs font-bold text-amber-700 dark:text-amber-500 uppercase tracking-wide">
                                Missing ({missingCount})
                             </span>
                          </div>
                          <div className="p-2 space-y-1">
                            {result.missingIngredients.map((item, i) => (
                              <div key={`${item.id}-${i}`} className="flex items-center justify-between p-2 rounded active:bg-amber-100/50 transition-colors">
                                <span className={`text-sm ${textClass} opacity-70`}>
                                  {/* Also show quantity for missing items if > 1 */}
                                  {item.quantity > 1 ? `${item.quantity}× ` : ''}{item.name}
                                </span>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => onReloadItem({ 
                                    term: item.name, 
                                    store: result.store,
                                    shoppingListId: item.id 
                                  })}
                                  className="h-8 text-xs gap-1 text-amber-600 active:bg-amber-200/50"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Find
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`p-4 border-t mt-auto flex-shrink-0 ${theme === "dark" ? "border-[#e8dcc4]/10 bg-[#1f1e1a]" : "border-gray-100 bg-gray-50"}`}>
                       <Button className={`w-full h-11 text-base ${buttonClass}`}>
                          Shop {result.store} <ExternalLink className="ml-2 h-4 w-4" />
                       </Button>
                       {missingCount > 0 && (
                         <p className="text-[10px] text-center mt-2 text-amber-600 opacity-80">
                           {missingCount} items to buy elsewhere
                         </p>
                       )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Dots */}
      <div className="flex justify-center gap-1.5 pb-4">
        {massSearchResults.map((_, i) => (
          <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === carouselIndex ? `w-4 ${theme === 'dark' ? 'bg-[#e8dcc4]' : 'bg-gray-800'}` : `w-1.5 ${theme === 'dark' ? 'bg-[#e8dcc4]/20' : 'bg-gray-300'}`}`} />
        ))}
      </div>
    </div>
  )
}