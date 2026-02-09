"use client"

import React, { useMemo } from "react"
import Image from "next/image"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DollarSign, CheckCircle2, MapPin, Clock } from "lucide-react"
import type { StoreComparison } from "@/lib/types/store"
import { useIsMobile } from "@/hooks/ui/use-mobile"

// Map store names to logo files (reused from store-comparison)
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

function titleCaseStore(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

interface StoreSelectorProps {
  stores: StoreComparison[]
  selectedStore: string | null
  onStoreChange: (storeName: string | null) => void
  className?: string
  theme?: "light" | "dark"
}

export function StoreSelector({
  stores,
  selectedStore,
  onStoreChange,
  className = "",
  theme = "light"
}: StoreSelectorProps) {
  const isMobile = useIsMobile()

  // Calculate store rankings
  const cheapestIndex = useMemo(() => {
    if (!stores?.length) return -1
    let bestIdx = 0
    let min = stores[0].total
    stores.forEach((store, idx) => {
      if (store.total < min) {
        min = store.total
        bestIdx = idx
      }
    })
    return bestIdx
  }, [stores])

  const bestValueIndex = useMemo(() => {
    if (!stores?.length) return -1
    let bestIdx = -1
    let minScore = Infinity

    stores.forEach((store, idx) => {
      const missingCount = store.missingIngredients?.length || 0
      const penalty = missingCount * 20 // $20 penalty per missing item
      const score = store.total + penalty
      if (score < minScore) {
        minScore = score
        bestIdx = idx
      }
    })
    return bestIdx
  }, [stores])

  const closestIndex = useMemo(() => {
    if (!stores?.length) return -1
    let bestIdx = -1
    let minDist = Infinity

    stores.forEach((store, idx) => {
      const dist = store.distanceMiles ?? Infinity
      if (dist < minDist) {
        minDist = dist
        bestIdx = idx
      }
    })
    return bestIdx === -1 ? -1 : bestIdx
  }, [stores])

  // Find the selected store object
  const selectedStoreObj = useMemo(() => {
    if (!selectedStore) return stores[0] // Default to first store
    return stores.find(s => s.store === selectedStore) || stores[0]
  }, [stores, selectedStore])

  if (!stores || stores.length === 0) {
    return null
  }

  // Mobile view: Select dropdown
  if (isMobile) {
    return (
      <div className={`w-full ${className}`}>
        <Select
          value={selectedStore || stores[0]?.store}
          onValueChange={(value) => onStoreChange(value === "best-overall" ? null : value)}
        >
          <SelectTrigger className="h-14 text-left">
            <div className="flex items-center gap-3 w-full">
              {selectedStoreObj && (
                <>
                  {getStoreLogo(selectedStoreObj.store) && (
                    <div className="relative h-8 w-8 flex-shrink-0">
                      <Image
                        src={getStoreLogo(selectedStoreObj.store)!}
                        alt={selectedStoreObj.store}
                        fill
                        className="object-contain"
                        sizes="32px"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {titleCaseStore(selectedStoreObj.store)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedStoreObj.items.length} items
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-bold text-base">
                      ${selectedStoreObj.total.toFixed(2)}
                    </p>
                  </div>
                </>
              )}
            </div>
          </SelectTrigger>
          <SelectContent>
            {stores.map((store, idx) => {
              const isCheapest = idx === cheapestIndex
              const isBest = idx === bestValueIndex
              const isClosest = idx === closestIndex
              const storeLogo = getStoreLogo(store.store)

              return (
                <SelectItem key={store.store} value={store.store} className="cursor-pointer">
                  <div className="flex items-center gap-3 py-1">
                    {storeLogo && (
                      <div className="relative h-6 w-6 flex-shrink-0">
                        <Image
                          src={storeLogo}
                          alt={store.store}
                          fill
                          className="object-contain"
                          sizes="24px"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {titleCaseStore(store.store)}
                        </span>
                        {isCheapest && (
                          <Badge variant="secondary" className="h-5 text-[10px] px-1.5 bg-amber-500 text-white">
                            <DollarSign className="h-2.5 w-2.5" />
                          </Badge>
                        )}
                        {isBest && (
                          <Badge variant="secondary" className="h-5 text-[10px] px-1.5 bg-green-600 text-white">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          </Badge>
                        )}
                        {isClosest && (
                          <Badge variant="secondary" className="h-5 text-[10px] px-1.5 bg-blue-500 text-white">
                            <MapPin className="h-2.5 w-2.5" />
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {store.items.length} items
                        {store.distanceMiles && ` • ${store.distanceMiles.toFixed(1)} mi`}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-sm">
                      ${store.total.toFixed(2)}
                    </span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
    )
  }

  // Desktop view: Horizontal carousel
  return (
    <div className={`flex items-center gap-6 overflow-x-auto pb-4 scrollbar-hide snap-x ${className}`}>
      {stores.map((store, idx) => {
        const isSelected = selectedStore ? store.store === selectedStore : idx === 0
        const isCheapest = idx === cheapestIndex
        const isBest = idx === bestValueIndex
        const isClosest = idx === closestIndex
        const storeLogo = getStoreLogo(store.store)

        return (
          <button
            key={store.store}
            type="button"
            onClick={() => onStoreChange(store.store)}
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
                      alt={store.store}
                      fill
                      className="object-contain p-1"
                      sizes="64px"
                    />
                  </div>
                ) : (
                  <span className="text-base font-bold text-gray-900">
                    {store.store.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Visual Indicators */}
              {isCheapest && (
                <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-1 border-2 border-white dark:border-[#121212] z-20 shadow-sm" title="Cheapest">
                  <DollarSign className="h-2.5 w-2.5 text-white" />
                </div>
              )}
              {isBest && (
                <div className="absolute -top-1 -right-1 bg-green-600 rounded-full p-1 border-2 border-white dark:border-[#121212] z-20 shadow-sm" title="Best Value">
                  <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                </div>
              )}
              {isClosest && (
                <div className="absolute -top-1 -left-1 bg-blue-500 rounded-full p-1 border-2 border-white dark:border-[#121212] z-20 shadow-sm" title="Closest">
                  <MapPin className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <span className={`text-[11px] font-bold truncate w-24 text-center ${
                isSelected
                  ? theme === 'dark' ? 'text-[#e8dcc4]' : 'text-gray-900'
                  : 'text-muted-foreground'
              }`}>
                {titleCaseStore(store.store)}
              </span>
              <div className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                isSelected
                  ? "bg-green-500 text-white shadow-md"
                  : theme === 'dark'
                    ? "bg-[#1f1e1a] text-[#e8dcc4] border border-[#e8dcc4]/20"
                    : "bg-white text-gray-900 border border-gray-200 shadow-sm"
              }`}>
                <span className="text-[10px] opacity-70">$</span>
                <span className="text-sm">{store.total.toFixed(2)}</span>
              </div>

              {/* Distance indicator */}
              {store.distanceMiles && (
                <span className="text-[9px] font-bold text-muted-foreground flex items-center gap-1 mt-0.5">
                  {store.distanceMiles.toFixed(1)} mi
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
