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
import { StoreMap } from "@/components/store/store-map"
import { useClosestStore } from "@/hooks" // Ensure this path is correct
import { getUserLocation } from "@/lib/geocoding"
import Image from "next/image"

// Map store names to logo files
function getStoreLogo(storeName: string): string | null {
  const normalized = storeName.toLowerCase().replace(/\s+/g, '')
  const logoMap: Record<string, string> = {
    'walmart': '/walmart.png',
    'target': '/Target.jpg',
    'kroger': '/kroger.jpg',
    'safeway': '/safeway.jpeg',
    'aldi': '/aldi.png',
    'traderjoes': '/trader-joes.png',
    "trader joe's": '/trader-joes.png',
    'meijer': '/meijers.png',
    'meijers': '/meijers.png',
    '99ranch': '/99ranch.png',
    '99 ranch': '/99ranch.png',
    '99ranchmarket': '/99ranch.png',
  }

  // Try exact match first
  if (logoMap[normalized]) return logoMap[normalized]

  // Try partial matches
  for (const [key, logo] of Object.entries(logoMap)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return logo
    }
  }

  return null
}

interface StoreComparisonSectionProps {
  comparisonLoading: boolean
  massSearchResults: StoreComparison[]
  carouselIndex: number
  onStoreSelect: (index: number) => void
  onReloadItem: (params: { term: string; store: string; shoppingListId: string; shoppingListIds?: string[] }) => void
  postalCode: string
  cardBgClass: string
  textClass: string
  mutedTextClass: string
  buttonClass: string
  theme: "light" | "dark"
}

const CACHE_KEY = "store_comparison_cache";
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

interface CachedStoreData {
  data: StoreComparison[];
  timestamp: number;
  postalCode: string;
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
  const [userCoords, setUserCoords] = useState<google.maps.LatLngLiteral | null>(null);
  const [cachedResults, setCachedResults] = useState<StoreComparison[]>([]);
  const [usingCache, setUsingCache] = useState(false);

  // Initialize the new hook
  const { closestIndex, travelData, calculateClosest, isLoading: travelLoading } = useClosestStore();

  // Load cached data on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsedCache: CachedStoreData = JSON.parse(cached);
        const now = Date.now();

        // Check if cache is valid and matches current postal code
        if (
          parsedCache.postalCode === postalCode &&
          now - parsedCache.timestamp < CACHE_TTL
        ) {
          setCachedResults(parsedCache.data);
          setUsingCache(true);
        } else {
          // Cache expired or different postal code
          localStorage.removeItem(CACHE_KEY);
        }
      }
    } catch (error) {
      console.error("Error loading cached store data:", error);
      localStorage.removeItem(CACHE_KEY);
    }
  }, [postalCode]);

  // Cache new results when they arrive
  useEffect(() => {
    if (typeof window === "undefined" || !massSearchResults.length) return;

    try {
      const cacheData: CachedStoreData = {
        data: massSearchResults,
        timestamp: Date.now(),
        postalCode,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      setUsingCache(false);
    } catch (error) {
      console.error("Error caching store data:", error);
    }
  }, [massSearchResults, postalCode]);

  // Use cached results if available and no new results
  const displayResults = massSearchResults.length > 0 ? massSearchResults : cachedResults;

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
    if (userCoords && displayResults.length > 0) {
      calculateClosest(userCoords, displayResults);
    }
  }, [userCoords, displayResults, calculateClosest]);

  const activeStore = useMemo(() => {
    return displayResults[carouselIndex] || displayResults[0];
  }, [displayResults, carouselIndex]);

  // Merge duplicate items by title and sum their quantities
  // Also track all shopping list IDs for merged items
  const mergedItems = useMemo(() => {
    if (!activeStore?.items) return [];

    const itemMap = new Map<string, typeof activeStore.items[0] & { shoppingItemIds: string[] }>();

    activeStore.items.forEach(item => {
      const key = item.title.toLowerCase().trim();
      if (itemMap.has(key)) {
        const existing = itemMap.get(key)!;
        itemMap.set(key, {
          ...existing,
          quantity: (existing.quantity || 1) + (item.quantity || 1),
          shoppingItemIds: [...existing.shoppingItemIds, item.shoppingItemId]
        });
      } else {
        itemMap.set(key, {
          ...item,
          shoppingItemIds: [item.shoppingItemId]
        });
      }
    });

    return Array.from(itemMap.values());
  }, [activeStore]);

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
    if (!displayResults?.length) return -1;
    let bestIdx = -1;
    let minScore = Infinity;

    displayResults.forEach((store, idx) => {
       const missingCount = store.missingIngredients?.length || 0;
       const penalty = missingCount * 20;
       const score = store.total + penalty;
       if (score < minScore) {
         minScore = score;
         bestIdx = idx;
       }
    });
    return bestIdx;
  }, [displayResults]);

  if ((!displayResults?.length) && !comparisonLoading && !usingCache) {
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
      {/* HEADER */}
      <div className="flex items-center justify-between px-2">
        <label className={`text-[11px] font-bold uppercase tracking-wider ${mutedTextClass}`}>
          Compare Stores ({displayResults.length}) {usingCache && <span className="text-[9px] opacity-50">(cached)</span>}
        </label>
      </div>

      {/* STORE SWITCHER RAIL */}
      <div className="flex items-center gap-6 overflow-x-auto pb-8 scrollbar-hide snap-x px-4 pt-4">
        {displayResults.map((result, idx) => {
          const isSelected = carouselIndex === idx;
          const isBest = idx === bestValueIndex;
          const isClosest = idx === closestIndex; // From new hook
          const travelInfo = travelData.get(idx); // From new hook
          const storeLogo = getStoreLogo(result.store);

          return (
            <button
              key={`${result.store}-${idx}`}
              type="button"
              onClick={() => onStoreSelect(idx)}
              className="flex-shrink-0 relative flex flex-col items-center gap-3 transition-all snap-start outline-none"
            >
              <div className="relative m-1">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 overflow-hidden bg-white
                  ${isSelected
                    ? "border-green-500 shadow-lg scale-110"
                    : theme === 'dark' ? "border-[#e8dcc4]/10" : "border-gray-200 shadow-sm"}
                `}>
                  {storeLogo ? (
                    <div className="relative w-full h-full p-2">
                      <Image
                        src={storeLogo}
                        alt={result.store}
                        fill
                        className="object-contain p-1"
                        sizes="64px"
                      />
                    </div>
                  ) : (
                    <span className={`text-base font-bold ${textClass}`}>
                      {result.store.substring(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Visual Indicators - Outside the scaled container */}
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

              <div className="flex flex-col items-center gap-1.5">
                <span className={`text-[11px] font-bold truncate w-24 text-center ${isSelected ? textClass : mutedTextClass}`}>
                  {result.store}
                </span>
                <div className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  isSelected
                    ? "bg-green-500 text-white shadow-md"
                    : theme === 'dark'
                      ? "bg-[#1f1e1a] text-[#e8dcc4] border border-[#e8dcc4]/20"
                      : "bg-white text-gray-900 border border-gray-200 shadow-sm"
                }`}>
                  <span className="text-[10px] opacity-70">$</span>
                  <span className="text-sm">{result.total.toFixed(2)}</span>
                </div>

                {/* Travel Time Display */}
                {travelInfo && (
                  <span className="text-[9px] font-bold text-blue-500 flex items-center gap-1 mt-0.5">
                    <Clock className="h-2.5 w-2.5" /> {travelInfo.duration}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* LIST AND MAP SIDE BY SIDE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT SIDE: LIST */}
        <div className="lg:col-span-2">
          <Card className={`overflow-hidden border-0 shadow-2xl ${cardBgClass} transition-all duration-300 h-full flex flex-col`}>
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
              {mergedItems.map((item, i) => (
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
                    <p className={`text-[11px] ${mutedTextClass}`}>
                      {item.originalName ? `Original: ${item.originalName}` : (item.brand || 'Store Brand')}
                    </p>
                  </div>
                  <div className="text-right mr-2">
                    <p className={`text-sm font-bold ${textClass}`}>${item.price.toFixed(2)}</p>
                    {(item.quantity || 1) > 1 && <p className={`text-[10px] ${mutedTextClass}`}>{item.quantity || 1} units</p>}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onReloadItem({ term: item.originalName, store: activeStore.store, shoppingListId: item.shoppingItemIds[0], shoppingListIds: item.shoppingItemIds })}
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
                    {activeStore.missingIngredients?.map((item, i) => (
                      <div key={`miss-${i}`} className="flex justify-between items-center bg-white/60 dark:bg-black/40 p-3 rounded-lg border border-amber-100 dark:border-amber-900/50">
                        <span className={`text-xs font-medium ${textClass}`}>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>

          <div className="p-5 bg-gray-50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 flex gap-3">
            <Button
              onClick={handleFindClosest}
              className={`flex-1 h-14 text-lg font-bold shadow-2xl transition-transform active:scale-[0.98] ${buttonClass}`}
            >
              Find Closest {activeStore.store} <MapPin className="ml-2 h-5 w-5" />
            </Button>
          </div>
          </Card>
        </div>

        {/* RIGHT SIDE: MAP */}
        <div className="lg:col-span-1">
          <Card className={`overflow-hidden border-0 shadow-2xl ${cardBgClass} p-4 h-full`}>
            <StoreMap
              comparisons={displayResults}
              onStoreSelected={onStoreSelect}
              userPostalCode={postalCode}
              selectedStoreIndex={carouselIndex}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}