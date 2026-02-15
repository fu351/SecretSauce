"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Minus, Plus, X, ArrowLeftRight, ShoppingCart, ChevronDown, ChevronUp } from "lucide-react"
import type { ShoppingListIngredient as ShoppingListItem } from "@/lib/types/store"
import type { StoreComparison } from "@/lib/types/store"

interface ReceiptItemProps {
  item: ShoppingListItem
  pricing: StoreComparison["items"][0] | null
  onQuantityChange: (itemId: string, quantity: number) => void
  onRemove: (itemId: string) => void
  onSwap?: (itemId: string) => void
  theme?: "light" | "dark"
  className?: string
}

function formatMeasure(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, "")
}

export function ReceiptItem({
  item,
  pricing,
  onQuantityChange,
  onRemove,
  onSwap,
  theme = "light",
  className = ""
}: ReceiptItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const quantity = item.quantity || 1
  const quantityDisplay = formatMeasure(quantity)
  const unit = item.unit || ""
  const isAvailable = pricing !== null
  const pricingBaselineQuantity = Math.max(1, Number(pricing?.quantity) || 1)
  const baselinePackages = pricing?.packagesToBuy && Number(pricing.packagesToBuy) > 0
    ? Number(pricing.packagesToBuy)
    : null
  const packagePrice = pricing?.packagePrice != null ? Number(pricing.packagePrice) : null
  const packagesPerQuantity = baselinePackages !== null
    ? baselinePackages / pricingBaselineQuantity
    : null
  const adjustedPackagesToBuy = pricing?.packagesToBuy
    ? Math.max(1, Math.ceil((packagesPerQuantity || 0) * quantity))
    : null
  const lineTotal = pricing
    ? (
      packagePrice !== null && adjustedPackagesToBuy !== null
        ? packagePrice * adjustedPackagesToBuy
        : (Number(pricing.price) || 0) * quantity
    )
    : null
  const packageQuantityDisplay = adjustedPackagesToBuy !== null
    ? formatMeasure(adjustedPackagesToBuy)
    : quantityDisplay

  const rawItemName = typeof item.name === "string" ? item.name.trim() : ""
  const displayName = rawItemName || pricing?.originalName?.trim() || pricing?.title?.trim() || "Unnamed item"
  const matchedProductName = pricing?.title?.trim() || ""
  const imageSourceRaw = (pricing as { image_url?: unknown; imageUrl?: unknown } | null)?.image_url
    ?? (pricing as { image_url?: unknown; imageUrl?: unknown } | null)?.imageUrl
  const imageSource = typeof imageSourceRaw === "string" && imageSourceRaw.trim().length > 0
    ? imageSourceRaw.trim()
    : null
  const showMatchedProductInline = Boolean(matchedProductName && matchedProductName !== displayName)

  const cartQuantitySummary = `${quantityDisplay}${unit ? ` ${unit}` : ""}`
  const purchaseQuantitySummary = adjustedPackagesToBuy !== null
    ? `${formatMeasure(adjustedPackagesToBuy)} ${Math.abs(adjustedPackagesToBuy - 1) < 0.0001 ? "package" : "packages"}`
    : cartQuantitySummary

  const textPrimaryClass = theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
  const stepperBgClass = theme === "dark" ? "bg-white/5 border-white/10" : "bg-gray-100 border-gray-200"
  const detailsBgClass = theme === "dark" ? "bg-white/[0.03] border-white/10" : "bg-gray-50 border-gray-200"

  const detailRows: Array<{ label: string; value: string }> = [
    { label: "Cart quantity", value: cartQuantitySummary },
    { label: "Buy at store", value: purchaseQuantitySummary },
  ]

  if (showMatchedProductInline) {
    detailRows.push({ label: "Matched product", value: matchedProductName })
  }

  if (pricing?.packagePrice !== null && pricing?.packagePrice !== undefined) {
    detailRows.push({ label: "Package price", value: `$${pricing.packagePrice.toFixed(2)}` })
  }

  if (pricing?.conversionError) {
    detailRows.push({ label: "Unit conversion", value: "Estimate required" })
  }

  if (pricing?.usedEstimate) {
    detailRows.push({ label: "Pricing source", value: "Estimated from available data" })
  }

  if (!isAvailable) {
    detailRows.push({ label: "Availability", value: "Not available at this store" })
  }

  const hasExpandedDetails = detailRows.length > 0

  const handleIncrement = () => {
    if (adjustedPackagesToBuy !== null && packagesPerQuantity && packagesPerQuantity > 0) {
      const nextPackages = adjustedPackagesToBuy + 1
      const nextQuantity = Number((nextPackages / packagesPerQuantity).toFixed(4))
      onQuantityChange(item.id, Math.max(1, nextQuantity))
      return
    }
    onQuantityChange(item.id, quantity + 1)
  }

  const handleDecrement = () => {
    if (adjustedPackagesToBuy !== null && packagesPerQuantity && packagesPerQuantity > 0) {
      const nextPackages = Math.max(1, adjustedPackagesToBuy - 1)
      const nextQuantity = Number((nextPackages / packagesPerQuantity).toFixed(4))
      onQuantityChange(item.id, Math.max(1, nextQuantity))
      return
    }
    onQuantityChange(item.id, Math.max(1, quantity - 1))
  }

  return (
    <div className={`p-3 md:p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${className}`}>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {imageSource ? (
            <img
              src={imageSource}
              alt={displayName}
              loading="lazy"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <ShoppingCart className="h-5 w-5 md:h-6 md:w-6 text-gray-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className={`font-semibold text-sm md:text-base leading-tight break-words pr-1 ${textPrimaryClass}`}>
                {displayName}
              </p>
              {showMatchedProductInline && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {matchedProductName}
                </p>
              )}
              {!isAvailable && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                  Not available at this store
                </p>
              )}
            </div>

            <div className="flex items-start gap-1 flex-shrink-0">
              <div className="text-right min-w-[4.5rem]">
                {isAvailable && lineTotal !== null ? (
                  <span className={`font-mono font-bold text-sm md:text-base ${textPrimaryClass}`}>
                    ${lineTotal.toFixed(2)}
                  </span>
                ) : (
                  <span className="font-mono text-sm text-muted-foreground">--</span>
                )}
              </div>

              {hasExpandedDetails && (
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="h-8 w-8"
                  aria-label={isExpanded ? "Collapse item details" : "Expand item details"}
                  title={isExpanded ? "Collapse details" : "Expand details"}
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              )}

              <Button
                size="icon"
                variant="ghost"
                type="button"
                onClick={() => onRemove(item.id)}
                className="h-8 w-8"
                title="Remove item"
              >
                <X className="h-4 w-4 text-gray-500 hover:text-red-500" />
              </Button>
            </div>
          </div>

          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Packages
              </p>
              <div className={`inline-flex items-center gap-1 px-1.5 py-1 rounded border ${stepperBgClass}`}>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={handleDecrement}
                  disabled={(adjustedPackagesToBuy !== null ? adjustedPackagesToBuy <= 1 : quantity <= 1) || !isAvailable}
                  className="h-7 w-7 md:h-8 md:w-8 flex-shrink-0 hover:bg-white/10 disabled:opacity-40"
                  aria-label={`Decrease quantity for ${displayName}`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>

                <span className="min-w-[2.25rem] text-center text-sm font-semibold">
                  {packageQuantityDisplay}
                </span>

                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={handleIncrement}
                  disabled={!isAvailable}
                  className="h-7 w-7 md:h-8 md:w-8 flex-shrink-0 hover:bg-white/10 disabled:opacity-40"
                  aria-label={`Increase quantity for ${displayName}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isAvailable ? (
                <Badge
                  variant="secondary"
                  className={theme === "dark"
                    ? "bg-green-900/30 text-green-300 border border-green-700/40"
                    : "bg-green-100 text-green-800 border border-green-200"
                  }
                >
                  In stock
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className={theme === "dark"
                    ? "bg-amber-900/30 text-amber-300 border border-amber-700/40"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
                  }
                >
                  Missing
                </Badge>
              )}

              {onSwap && (
                <Button
                  size="sm"
                  variant={isAvailable ? "ghost" : "outline"}
                  type="button"
                  onClick={() => onSwap(item.id)}
                  className="h-7 px-2 text-[11px]"
                  data-tutorial="store-replace"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  <span className="hidden sm:inline ml-1">Replace</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && detailRows.length > 0 && (
        <div className={`mt-3 ml-[3.25rem] md:ml-[3.5rem] rounded-md border p-2.5 ${detailsBgClass}`}>
          <div className="space-y-1.5">
            {detailRows.map((row) => (
              <div key={`${row.label}-${row.value}`} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={`text-right font-medium ${textPrimaryClass}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
