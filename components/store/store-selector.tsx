"use client"

import React, { useMemo } from "react"
import Image from "next/image"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DollarSign, CheckCircle2, MapPin } from "lucide-react"
import type { StoreComparison } from "@/lib/types/store"
import { useIsMobile } from "@/hooks/ui/use-mobile"

// Map store names to logo files (reused from store-comparison)
function getStoreLogo(storeName: string): string | null {
  const normalized = storeName.toLowerCase().replace(/\s+/g, "")
  const logoMap: Record<string, string> = {
    "walmart": "/walmart.png",
    "target": "/Target.jpg",
    "kroger": "/kroger.jpg",
    "safeway": "/safeway.jpeg",
    "aldi": "/aldi.png",
    "traderjoes": "/trader-joes.png",
    "trader joe's": "/trader-joes.png",
    "meijer": "/meijers.png",
    "meijers": "/meijers.png",
    "99ranch": "/99ranch.png",
    "99 ranch": "/99ranch.png",
    "99ranchmarket": "/99ranch.png",
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
      <div className={`w-full ${className}`} data-tutorial="store-selector">
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
          <SelectContent
            className="max-h-[50vh]"
          >
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

  // Desktop view: dense comparison grid
  return (
    <div className={`w-full min-w-0 max-w-full ${className}`} data-tutorial="store-selector">
      <div className="min-w-0">
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
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
                className={`relative min-w-0 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isSelected
                    ? theme === "dark"
                      ? "border-[#e8dcc4]/45 bg-[#e8dcc4]/10"
                      : "border-green-500 bg-green-50"
                    : theme === "dark"
                      ? "border-[#e8dcc4]/10 bg-white/[0.03] hover:bg-white/[0.06]"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
                    {storeLogo ? (
                      <Image
                        src={storeLogo}
                        alt={store.store}
                        fill
                        className="object-contain p-1.5"
                        sizes="40px"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-bold text-gray-900">
                        {store.store.substring(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className={`truncate text-sm font-semibold ${
                        isSelected
                          ? theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
                          : theme === "dark" ? "text-[#e8dcc4]/85" : "text-gray-800"
                      }`}>
                        {titleCaseStore(store.store)}
                      </p>
                      {isSelected && (
                        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" aria-hidden />
                      )}
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                      {isCheapest && (
                        <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] bg-amber-500 text-white">
                          <DollarSign className="h-2.5 w-2.5" />
                          Low
                        </Badge>
                      )}
                      {isBest && (
                        <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] bg-green-600 text-white">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Value
                        </Badge>
                      )}
                      {isClosest && (
                        <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] bg-blue-500 text-white">
                          <MapPin className="h-2.5 w-2.5" />
                          Close
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <p>{store.items.length} priced items</p>
                    {store.distanceMiles && <p>{store.distanceMiles.toFixed(1)} mi away</p>}
                  </div>
                  <p className={`font-mono text-lg font-bold ${
                    theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
                  }`}>
                    ${store.total.toFixed(2)}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <p className={`mt-1 text-[11px] ${
        theme === "dark" ? "text-[#e8dcc4]/70" : "text-muted-foreground"
      }`}>
        {stores.length} stores compared
      </p>
    </div>
  )
}
