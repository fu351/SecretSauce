"use client"

import { useEffect, useState } from "react"
import { DollarSign, TrendingDown, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RecipePricingSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { recipeDB } from "@/lib/database/recipe-db"
import Image from "next/image"
import { useAuth } from "@/contexts/auth-context"
import { profileDB } from "@/lib/database/profile-db"
import { normalizeZipCode } from "@/lib/utils/zip"

{/*TODO FIX: Currently only fetches from a few stores. Expand to more stores and make store list configurable by user.*/}

interface RecipePricingProps {
  recipeId: string
  servings?: number
  zipCode?: string
}

const STORES_TO_CHECK = ["walmart", "target", "kroger", "safeway", "aldi"]

type CostEstimate = {
  totalCost: number
  costPerServing: number | null
  ingredients: Record<string, unknown>
  store: string
}

const toFiniteNumber = (value: unknown): number | null => {
  const numberValue = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const formatPrice = (value: unknown, fallback = "0.00") => {
  const numberValue = toFiniteNumber(value)
  return numberValue === null ? fallback : numberValue.toFixed(2)
}

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
  zipCode 
}: RecipePricingProps) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pricingResults, setPricingResults] = useState<CostEstimate[]>([])
  const [profileZipCode, setProfileZipCode] = useState<string | null>(null)
  const resolvedZipCode = normalizeZipCode(zipCode || profileZipCode)
  const displayZipCode = resolvedZipCode || zipCode || "your area"

  useEffect(() => {
    if (!userId) {
      setProfileZipCode(null)
      return
    }

    let isActive = true
    void (async () => {
      try {
        const data = await profileDB.fetchProfileFields(userId, ["zip_code"])
        if (isActive) {
          setProfileZipCode(data?.zip_code ?? null)
        }
      } catch (fetchError) {
        console.error("[RecipePricingInfo] Failed to load profile zip:", fetchError)
      }
    })()

    return () => {
      isActive = false
    }
  }, [userId])

  useEffect(() => {
    async function fetchAllPricing() {
      if (!resolvedZipCode) {
        setError("Set a ZIP code to fetch pricing.")
        setPricingResults([])
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        setError(null)
        // Fetch pricing for all supported stores in parallel
        const pricePromises = STORES_TO_CHECK.map(store => 
          recipeDB.calculateCostEstimate(recipeId, store, resolvedZipCode, servings, userId)
        )
        
        const results = await Promise.all(pricePromises)
        // Filter out nulls (stores where items weren't found) and add the store name
        const validResults = results
          .map((res, index) => {
            const totalCost = toFiniteNumber(res?.totalCost)

            // Only count it as a valid result if it found ingredients (totalCost > 0)
            if (res && totalCost !== null && totalCost > 0) {
              return {
                ...res,
                totalCost,
                costPerServing: toFiniteNumber(res.costPerServing),
                ingredients: res.ingredients && typeof res.ingredients === "object" ? res.ingredients : {},
                store: STORES_TO_CHECK[index],
              }
            }
            return null
          })
          .filter((result): result is CostEstimate => result !== null)
          .sort((a, b) => a.totalCost - b.totalCost)

        setPricingResults(validResults)
      } catch (err) {
        setError("Failed to fetch current pricing data.")
      } finally {
        setLoading(false)
      }
    }

    fetchAllPricing()
  }, [recipeId, servings, resolvedZipCode, userId])

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
            {error ?? `No local price data found for these ingredients in ${displayZipCode}.`}
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
                ${formatPrice(cheapest.totalCost)}
              </p>
              <p className="text-xs text-muted-foreground">
                ${formatPrice(cheapest.costPerServing)} / serving
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
                <span className="font-mono font-medium text-foreground">
                  {toFiniteNumber(price) === null ? "Unavailable" : `$${formatPrice(price)}`}
                </span>
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
                  <span className="text-xs font-bold">${formatPrice(result.totalCost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
