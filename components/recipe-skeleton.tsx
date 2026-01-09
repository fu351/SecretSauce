"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useTheme } from "@/contexts/theme-context"
import clsx from "clsx"
import type { SkeletonLineProps } from "@/lib/types/skeleton"

export function SkeletonLine({ className = "" }: SkeletonLineProps) {
  const { theme } = useTheme()
  const bgColor = theme === "dark" ? "bg-card/50" : "bg-gray-200"
  return <div className={clsx(bgColor, "rounded animate-pulse", className)} />
}

export function RecipeSkeleton() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const cardBg = isDark ? "bg-card border border-border" : "bg-white"

  return (
    <Card className={clsx("overflow-hidden", cardBg)}>
      <div className={clsx("relative h-48 w-full animate-pulse", isDark ? "bg-card/50" : "bg-gray-200")} />
      <CardContent className="p-4 space-y-3">
        <SkeletonLine className="h-6 w-3/4" />
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-4 w-2/3" />
        <div className="flex gap-4 mt-4">
          <SkeletonLine className="h-4 w-20" />
          <SkeletonLine className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  )
}

export function RecipeDetailSkeleton() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const pageBackground = isDark ? "bg-background" : "bg-gradient-to-br from-orange-50 to-yellow-50"
  const cardBg = isDark ? "bg-card border border-border" : "bg-white/90 backdrop-blur-sm border-0"
  const skeletonBg = isDark ? "bg-card/50" : "bg-gray-200"

  return (
    <div className={clsx("min-h-screen transition-colors", pageBackground)}>
      {/* Back button skeleton */}
      <div className="fixed z-50 top-24 left-4 sm:top-28 sm:left-6">
        <div className={clsx("h-10 w-20 rounded animate-pulse", skeletonBg)} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* Image and Info Panel */}
        <div className="flex flex-col lg:flex-row gap-8 items-center">
          {/* Image skeleton */}
          <div className="lg:w-3/5 w-full">
            <div className={clsx("relative overflow-hidden rounded-2xl shadow-xl h-[360px] sm:h-[420px] md:h-[500px] animate-pulse", skeletonBg)} />
          </div>

          {/* Info panel skeleton */}
          <div className="lg:w-2/5 w-full">
            <Card className={cardBg}>
              <CardContent className="p-8 space-y-8">
                {/* Title */}
                <SkeletonLine className="h-8 w-3/4" />

                {/* Description */}
                <div className="space-y-2">
                  <SkeletonLine className="h-4 w-full" />
                  <SkeletonLine className="h-4 w-5/6" />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={clsx("p-4 rounded-lg animate-pulse", skeletonBg, "h-20")} />
                  ))}
                </div>

                {/* Nutrition skeleton */}
                <div className={clsx("p-4 rounded-lg animate-pulse", skeletonBg, "h-20")} />

                {/* Tags/badges */}
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={clsx("h-6 w-20 rounded-full animate-pulse", skeletonBg)} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Pricing Section skeleton */}
        <Card className={cardBg}>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <SkeletonLine className="h-6 w-32" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <SkeletonLine key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Ingredients section skeleton */}
        <Card className={cardBg}>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <SkeletonLine className="h-6 w-32" />
              <SkeletonLine className="h-10 w-32" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <SkeletonLine key={i} className="h-12" />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Instructions section skeleton */}
        <Card className={cardBg}>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <SkeletonLine className="h-6 w-32" />
            <div className="space-y-3 sm:space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4">
                  <SkeletonLine className="h-8 w-8 rounded-full flex-shrink-0" />
                  <SkeletonLine className="h-16 flex-1" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Reviews section skeleton */}
        <Card className={cardBg}>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <SkeletonLine className="h-6 w-32" />
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <SkeletonLine className="h-4 w-40" />
                  <SkeletonLine className="h-20 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function RecipePricingSkeleton() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const cardBg = isDark ? "bg-card border border-border" : "bg-white/90 backdrop-blur-sm border-0"
  const skeletonBg = isDark ? "bg-card/50" : "bg-gray-200"

  return (
    <Card className={cardBg}>
      <CardHeader className="pb-4">
        <SkeletonLine className="h-6 w-40" />
        <SkeletonLine className="h-4 w-64 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Store pricing cards */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
            <SkeletonLine className={clsx("h-12 w-12 rounded-full flex-shrink-0", skeletonBg)} />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="h-5 w-32" />
              <SkeletonLine className="h-4 w-48" />
            </div>
            <SkeletonLine className="h-6 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function RecipeReviewsSkeleton() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const cardBg = isDark ? "bg-card border border-border" : "bg-white/90 backdrop-blur-sm border-0"

  return (
    <Card className={cardBg}>
      <CardHeader className="pb-4">
        <SkeletonLine className="h-6 w-32" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Review items */}
        {[1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <div className="flex items-center gap-2">
              <SkeletonLine className="h-4 w-24" />
              <SkeletonLine className="h-4 w-32" />
            </div>
            <SkeletonLine className="h-20 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
