"use client"

import { useEffect, useState } from "react"
import { DollarSign, TrendingDown, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTheme } from "@/contexts/theme-context"
import clsx from "clsx"
import Image from "next/image"

interface StorePricing {
  store: string
  total: number
  items: Array<{
    ingredient: string
    price: number
    quantity: number
    unit: string
  }>
}

interface RecipePricingProps {
  recipeId: string
}

const getStoreLogoPath = (store: string) => {
  const key = store.trim().toLowerCase()
  if (key.includes("target")) return "/Target.jpg"
  if (key.includes("kroger")) return "/kroger.jpg"
  if (key.includes("meijer")) return "/meijers.png"
  if (key.includes("99")) return "/99ranch.png"
  if (key.includes("walmart")) return "/walmart.png"
  if (key.includes("trader")) return "/trader-joes.png"
  if (key.includes("aldi")) return "/aldi.png"
  if (key.includes("safeway")) return "/safeway.jpeg"
  return "/placeholder-logo.png"
}

/**
 * Component to display recipe pricing information
 * Shows the cheapest store option and breakdown by store
 */
export function RecipePricingInfo({ recipeId }: RecipePricingProps) {
  const [pricingData, setPricingData] = useState<{
    recipeName: string
    cheapest: StorePricing | null
    byStore: StorePricing[]
    allStores: string[]
    totalIngredients: number
    cachedIngredients: number
    isComplete: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { theme } = useTheme()
  const isDark = theme === "dark"

  useEffect(() => {
    const fetchPricingInfo = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/recipe-pricing?recipeId=${recipeId}`)
        const data = await response.json()

        if (!response.ok) {
          setError(data.error || "Failed to fetch pricing information")
          return
        }

        setPricingData(data)
        setError(null)
      } catch (err) {
        console.error("Error fetching recipe pricing:", err)
        setError("Failed to load pricing information")
      } finally {
        setLoading(false)
      }
    }

    if (recipeId) {
      fetchPricingInfo()
    }
  }, [recipeId])

  if (loading) {
    return (
      <Card
        className={clsx(
          "shadow-lg border rounded-2xl",
          isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0"
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Recipe Cost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading pricing information...</div>
        </CardContent>
      </Card>
    )
  }

  if (error || !pricingData || !pricingData.cheapest || !pricingData.isComplete) {
    return (
      <Card
        className={clsx(
          "shadow-lg border rounded-2xl",
          isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0"
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Recipe Cost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">
            {error || (pricingData && !pricingData.isComplete
              ? `Pricing incomplete: ${pricingData.cachedIngredients} of ${pricingData.totalIngredients} ingredients have cached prices.`
              : "Recipe pricing not yet available. Ingredients may not be standardized.")}
          </div>
        </CardContent>
      </Card>
    )
  }

  const cheapest = pricingData.cheapest
  const savings =
    pricingData.byStore.length > 1
      ? pricingData.byStore[pricingData.byStore.length - 1].total - cheapest.total
      : 0

  return (
    <Card
      className={clsx(
        "shadow-lg border rounded-2xl",
        isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0"
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Recipe Cost
        </CardTitle>
        <CardDescription>Cheapest option for this recipe based on current prices</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cheapest option */}
        <div
          className={clsx(
            "p-4 rounded-lg border-2",
            isDark
              ? "bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30"
              : "bg-gradient-to-br from-green-100 to-emerald-100 border-green-300"
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center overflow-hidden border border-border/50 shadow-sm">
                <Image
                  src={getStoreLogoPath(cheapest.store)}
                  alt={`${cheapest.store} logo`}
                  width={40}
                  height={40}
                  className="object-contain"
                />
              </div>
              <div className="text-sm font-medium text-muted-foreground">Cheapest</div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-green-600">${cheapest.total.toFixed(2)}</div>
            </div>
          </div>
          {savings > 0 && (
            <div
              className={clsx(
                "mt-2 text-sm font-medium flex items-center gap-1",
                isDark ? "text-green-400" : "text-green-700"
              )}
            >
              <TrendingDown className="w-4 h-4" />
              Save ${savings.toFixed(2)} vs most expensive option
            </div>
          )}
        </div>

        {/* Ingredient breakdown */}
        {cheapest.items.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Ingredient Breakdown:</div>
            <div className="space-y-1 text-sm">
              {cheapest.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center py-1">
                  <span className={isDark ? "text-muted-foreground" : "text-gray-600"}>
                    {item.ingredient}
                  </span>
                  <span className="font-medium">${item.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All store comparison */}
        {pricingData.byStore.length > 1 && (
          <div className="space-y-2 pt-2">
            <div className="text-sm font-medium">Price by Store:</div>
            <div className="grid grid-cols-2 gap-2">
              {pricingData.byStore.map((store, idx) => (
                <div
                  key={idx}
                  className={clsx(
                    "p-2 rounded text-sm border flex items-center gap-2",
                    store.store === cheapest.store
                      ? isDark
                        ? "bg-green-500/10 border-green-500/30"
                        : "bg-green-100 border-green-300"
                      : isDark
                        ? "bg-secondary/70 border-border"
                        : "bg-gray-100 border-gray-200"
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden border border-border/50 flex-shrink-0">
                    <Image
                      src={getStoreLogoPath(store.store)}
                      alt={`${store.store} logo`}
                      width={28}
                      height={28}
                      className="object-contain"
                    />
                  </div>
                  <div className={clsx("font-medium", store.store === cheapest.store && "text-green-600")}>
                    ${store.total.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
