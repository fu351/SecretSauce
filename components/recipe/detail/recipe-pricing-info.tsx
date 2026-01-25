"use client"

import { useEffect, useState } from "react"
import { DollarSign, TrendingDown, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RecipePricingSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { recipeDB } from "@/lib/database/recipe-db"
import Image from "next/image"

{/*TODO FIX: Currently only fetches from a few stores. Expand to more stores and make store list configurable by user.*/}

interface RecipePricingProps {
  recipeId: string
  servings?: number
  zipCode?: string
}

const STORES_TO_CHECK = ["walmart", "target", "kroger", "safeway", "aldi"]

const getStoreLogoPath = (store: string) => {
  const key = store.toLowerCase()
  if (key.includes("target")) return "/Target.jpg"
  if (key.includes("kroger")) return "/kroger.jpg"
  if (key.includes("walmart")) return "/walmart.png"
  if (key.includes("aldi")) return "/aldi.png"
  if (key.includes("safeway")) return "/safeway.jpeg"
  return "/placeholder-logo.png"
}

export function RecipePricingInfo({ 
  recipeId, 
  servings = 2, 
  zipCode = "47906" 
}: RecipePricingProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pricingResults, setPricingResults] = useState<any[]>([])

  useEffect(() => {
    async function fetchAllPricing() {
      setLoading(true)
      try {
        // Fetch pricing for all supported stores in parallel
        const pricePromises = STORES_TO_CHECK.map(store => 
          recipeDB.calculateCostEstimate(recipeId, store, zipCode, servings)
        )
        
        const results = await Promise.all(pricePromises)
        // Filter out nulls (stores where items weren't found) and add the store name
        const validResults = results
          .map((res, index) => {
            // Only count it as a valid result if it found ingredients (totalCost > 0)
            if (res && res.totalCost > 0) {
              return { ...res, store: STORES_TO_CHECK[index] };
            }
            return null;
          })
          .filter(Boolean)
          .sort((a, b) => a.totalCost - b.totalCost);

        setPricingResults(validResults)
      } catch (err) {
        setError("Failed to fetch current pricing data.")
      } finally {
        setLoading(false)
      }
    }

    fetchAllPricing()
  }, [recipeId, servings, zipCode])

  if (loading) return <RecipePricingSkeleton />

  if (error || pricingResults.length === 0) {
    return (
      <Card className="shadow-md border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="w-4 h-4 text-destructive" />
            Pricing Unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No local price data found for these ingredients in {zipCode}.
          </p>
        </CardContent>
      </Card>
    )
  }

  const cheapest = pricingResults[0]
  const mostExpensive = pricingResults[pricingResults.length - 1]
  const savings = mostExpensive.totalCost - cheapest.totalCost

  return (
    <Card className="shadow-sm border-border overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="w-5 h-5 text-primary" />
          Recipe Cost
        </CardTitle>
        <CardDescription>
          Estimated total for {servings} servings
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Featured Cheapest Store */}
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/10 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-white shadow-sm">
                <Image
                  src={getStoreLogoPath(cheapest.store)}
                  alt={cheapest.store}
                  fill
                  className="object-contain p-1"
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Best Value
                </p>
                <p className="text-lg font-bold capitalize">{cheapest.store}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                ${cheapest.totalCost.toFixed(2) ?? "0.00"}
              </p>
              <p className="text-xs text-muted-foreground">
                ${cheapest.costPerServing.toFixed(2) ?? "0.00"} / serving
              </p>
            </div>
          </div>

          {savings > 0 && (
            <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <TrendingDown className="w-4 h-4" />
              Save ${savings.toFixed(2)} compared to local alternatives
            </div>
          )}
        </div>

        {/* Ingredient Cost Items */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Estimate Breakdown</h4>
          <div className="divide-y divide-border rounded-lg border bg-card">
            {Object.entries(cheapest.ingredients as Record<string, number>).map(([name, price]) => (
              <div key={name} className="flex justify-between p-3 text-sm">
                <span className="capitalize">{name}</span>
                <span className="font-mono font-medium text-foreground">${price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Store Comparison Grid */}
        {pricingResults.length > 1 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Other Stores</h4>
            <div className="grid grid-cols-2 gap-3">
              {pricingResults.slice(1).map((result) => (
                <div 
                  key={result.store}
                  className="flex items-center justify-between rounded-lg border bg-secondary/30 p-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border bg-white">
                      <Image
                        src={getStoreLogoPath(result.store)}
                        alt={result.store}
                        fill
                        className="object-contain p-0.5"
                      />
                    </div>
                    <span className="text-xs font-medium capitalize">{result.store}</span>
                  </div>
                  <span className="text-xs font-bold">${result.totalCost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}