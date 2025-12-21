"use client"

import React, { useMemo, useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  AlertCircle, 
  ShoppingCart,
  MapPin, 
  ArrowLeftRight,
  Store,
  CheckCircle2,
  Map as MapIcon,
  List,
  Clock
} from "lucide-react"

import type { StoreComparison } from "@/lib/types/store"
import { StoreMap } from "@/components/store-map"
import { useClosestStore } from "@/hooks/useClosestStore" // Ensure this path is correct
import { getUserLocation } from "@/lib/geocoding"

interface StoreComparisonSectionProps {
  comparisonLoading: boolean
  massSearchResults: StoreComparison[]
  carouselIndex: number 
  onStoreSelect: (index: number) => void
  onReloadItem: (params: { term: string; store: string; shoppingListId: string }) => void 
  postalCode: string
  cardBgClass: string
  textClass: string
  mutedTextClass: string
  buttonClass: string
  theme: "light" | "dark"
}

export function StoreComparisonSection({
  comparisonLoading,
  massSearchResults,
  carouselIndex,
  onStoreSelect,
  onReloadItem,
  postalCode,
  cardBgClass,
  textClass,
  mutedTextClass,
  buttonClass,
  theme,
}: StoreComparisonSectionProps) {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [viewType, setViewType] = useState<"list" | "map">("list");
  const [userCoords, setUserCoords] = useState<google.maps.LatLngLiteral | null>(null);

  // Initialize the new hook
  const { closestIndex, travelData, calculateClosest, isLoading: travelLoading } = useClosestStore();

  // 1. Get User Location on Mount
  useEffect(() => {
    const fetchLocation = async () => {
      const loc = await getUserLocation();
      if (loc) setUserCoords(loc);
    };
    fetchLocation();
  }, []);

  // 2. Trigger Distance Calculations
  useEffect(() => {
    if (userCoords && massSearchResults.length > 0) {
      calculateClosest(userCoords, massSearchResults);
    }
  }, [userCoords, massSearchResults, calculateClosest]);

  const activeStore = useMemo(() => {
    return massSearchResults[carouselIndex] || massSearchResults[0];
  }, [massSearchResults, carouselIndex]);

  useEffect(() => {
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [carouselIndex]);

  const handleFindClosest = () => {
    if (!activeStore) return;
    const query = encodeURIComponent(`${activeStore.store} near ${postalCode || 'me'}`);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  };

  const bestValueIndex = useMemo(() => {
    if (!massSearchResults?.length) return -1;
    let bestIdx = -1;
    let minScore = Infinity;

    massSearchResults.forEach((store, idx) => {
       const missingCount = store.missingIngredients?.length || 0;
       const penalty = missingCount * 20; 
       const score = store.total + penalty;
       if (score < minScore) {
         minScore = score;
         bestIdx = idx;
       }
    });
    return bestIdx;
  }, [massSearchResults]);

  if ((!massSearchResults?.length) && !comparisonLoading) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${mutedTextClass}`}>
        <Store className="h-12 w-12 mb-4 opacity-10" />
        <p className="text-sm">No stores found with these items.</p>
      </div>
    );
  }

  const missingCount = activeStore?.missingIngredients?.length || 0;
  const percentFound = activeStore ? Math.round((activeStore.items.length / (activeStore.items.length + missingCount)) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* HEADER & VIEW TOGGLE */}
      <div className="flex items-center justify-between px-2">
        <label className={`text-[11px] font-bold uppercase tracking-wider ${mutedTextClass}`}>
          Compare Stores ({massSearchResults.length})
        </label>
        <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-lg border border-white/10">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setViewType("list")}
            className={`h-7 px-3 gap-2 ${viewType === 'list' ? buttonClass : mutedTextClass}`}
          >
            <List className="h-3.5 w-3.5" /> List
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setViewType("map")}
            className={`h-7 px-3 gap-2 ${viewType === 'map' ? buttonClass : mutedTextClass}`}
          >
            <MapIcon className="h-3.5 w-3.5" /> Map
          </Button>
        </div>
      </div>

      {/* STORE SWITCHER RAIL */}
      <div className="flex items-center gap-6 overflow-x-auto pb-8 scrollbar-hide snap-x px-4 pt-4"> 
        {massSearchResults.map((result, idx) => {
          const isSelected = carouselIndex === idx;
          const isBest = idx === bestValueIndex;
          const isClosest = idx === closestIndex; // From new hook
          const travelInfo = travelData.get(idx); // From new hook

          return (
            <button
              key={`${result.store}-${idx}`}
              type="button" 
              onClick={() => onStoreSelect(idx)}
              className="flex-shrink-0 relative flex flex-col items-center gap-3 transition-all snap-start outline-none"
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 m-1
                ${isSelected 
                  ? "border-green-500 bg-green-500/10 shadow-lg scale-110 z-10" 
                  : theme === 'dark' ? "border-[#e8dcc4]/10 bg-[#1f1e1a]" : "border-gray-200 bg-white shadow-sm"}
              `}>
                <span className={`text-base font-bold ${isSelected ? "text-green-500" : textClass}`}>
                  {result.store.substring(0, 2).toUpperCase()}
                </span>
                
                {/* Visual Indicators */}
                {isBest && (
                  <div className="absolute -top-1 -right-1 bg-green-600 rounded-full p-1 border-2 border-white dark:border-[#121212] z-20 shadow-sm" title="Best Price">
                    <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
                {isClosest && (
                  <div className="absolute -top-1 -left-1 bg-blue-500 rounded-full p-1 border-2 border-white dark:border-[#121212] z-20 shadow-sm" title="Closest to you">
                    <MapPin className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className={`text-[10px] font-bold truncate w-20 text-center ${isSelected ? textClass : mutedTextClass}`}>
                  {result.store}
                </span>
                <Badge variant="outline" className={`text-[9px] px-1.5 h-4 font-mono ${isSelected ? "bg-green-500 text-white" : "bg-gray-100 dark:bg-[#181813]"}`}>
                  ${result.total.toFixed(2)}
                </Badge>
                
                {/* Travel Time Display */}
                {travelInfo && (
                  <span className="text-[9px] font-bold text-blue-500 flex items-center gap-1">
                    <Clock className="h-2 w-2" /> {travelInfo.duration}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* CONDITIONAL RENDERING: LIST OR MAP */}
      {viewType === "map" ? (
        <Card className={`overflow-hidden border-0 shadow-2xl ${cardBgClass} p-4`}>
          <StoreMap 
            comparisons={massSearchResults}
            onStoreSelected={onStoreSelect}
            userPostalCode={postalCode}
            selectedStoreIndex={carouselIndex}
          />
        </Card>
      ) : (
        <Card className={`overflow-hidden border-0 shadow-2xl ${cardBgClass} transition-all duration-300`}>
          <div className={`p-6 flex justify-between items-end border-b ${theme === 'dark' ? 'border-white/5 bg-white/5' : 'border-gray-100 bg-gray-50/50'}`}>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <h4 className={`text-2xl font-bold ${textClass}`}>{activeStore.store}</h4>
                {carouselIndex === bestValueIndex && <Badge className="bg-green-600 text-[10px] px-2 h-5">BEST VALUE</Badge>}
                {carouselIndex === closestIndex && <Badge className="bg-blue-500 text-[10px] px-2 h-5">CLOSEST</Badge>}
              </div>
              <p className={`text-xs font-medium ${percentFound === 100 ? 'text-green-500' : 'text-amber-500'}`}>
                {percentFound}% Stock Match ({activeStore.items.length} items found)
              </p>
            </div>
            <div className="text-right">
              <p className={`text-[10px] font-bold uppercase tracking-tight ${mutedTextClass} mb-1`}>Total</p>
              <p className={`text-4xl font-black ${textClass} tracking-tight`}>
                <span className="text-xl font-normal mr-0.5 opacity-70">$</span>{activeStore.total.toFixed(2)}
              </p>
            </div>
          </div>

          <CardContent 
            key={activeStore.store}
            ref={listContainerRef} 
            className="p-0 min-h-[400px] max-h-[600px] overflow-y-auto scroll-smooth"
          >
            <div className="divide-y divide-gray-100 dark:divide-white/5">
              {activeStore.items.map((item, i) => (
                <div key={`${item.id}-${i}`} className="p-4 flex items-center gap-4 group hover:bg-black/5 transition-colors">
                  <div className={`h-12 w-12 rounded-lg p-1 flex-shrink-0 shadow-sm flex items-center justify-center border ${theme === 'dark' ? 'bg-white border-white/10' : 'bg-white border-gray-100'}`}>
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <ShoppingCart className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${textClass}`}>{item.title}</p>
                    <p className={`text-[11px] ${mutedTextClass}`}>{item.brand || 'Store Brand'}</p>
                  </div>
                  <div className="text-right mr-2">
                    <p className={`text-sm font-bold ${textClass}`}>${item.price.toFixed(2)}</p>
                    {item.quantity > 1 && <p className={`text-[10px] ${mutedTextClass}`}>{item.quantity} units</p>}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onReloadItem({ term: item.originalName, store: activeStore.store, shoppingListId: item.shoppingItemId })}
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              
              {missingCount > 0 && (
                <div className="bg-amber-50/30 dark:bg-amber-900/10 p-5">
                  <div className="flex items-center gap-2 mb-4">
                     <AlertCircle className="h-4 w-4 text-amber-500" />
                     <span className="text-xs font-bold uppercase tracking-widest text-amber-600">Missing ({missingCount})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {activeStore.missingIngredients.map((item, i) => (
                      <div key={`miss-${i}`} className="flex justify-between items-center bg-white/60 dark:bg-black/40 p-3 rounded-lg border border-amber-100 dark:border-amber-900/50">
                        <span className={`text-xs font-medium ${textClass}`}>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>

          <div className="p-5 bg-gray-50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5">
            <Button 
              onClick={handleFindClosest}
              className={`w-full h-14 text-lg font-bold shadow-2xl transition-transform active:scale-[0.98] ${buttonClass}`}
            >
              Find Closest {activeStore.store} <MapPin className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}