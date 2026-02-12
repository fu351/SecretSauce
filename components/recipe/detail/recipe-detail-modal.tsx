"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Star, ChevronRight, Zap } from "lucide-react"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { useRecipe, useResponsiveImage } from "@/hooks"
import { type Recipe } from "@/lib/types"
import { useTheme } from "@/contexts/theme-context"

interface RecipeDetailModalProps {
  recipeId: string | null
  onClose: () => void
  onAddToCart: (recipe: Recipe, servings: number) => Promise<void>
  textClass?: string
  mutedTextClass?: string
  buttonClass?: string
  theme?: string
  bgClass?: string
}

export function RecipeDetailModal({
  recipeId,
  onClose,
  onAddToCart,
  textClass: propTextClass,
  mutedTextClass: propMutedTextClass,
  buttonClass: propButtonClass,
  theme: propTheme,
  bgClass: propBgClass,
}: RecipeDetailModalProps) {
  const [servings, setServings] = useState(1)
  const [isAdding, setIsAdding] = useState(false)
  const { data: recipe, isLoading } = useRecipe(recipeId)
  const { theme: contextTheme } = useTheme()

  const imageConfig = useResponsiveImage({
    mobile: { width: 400, height: 250 },
    tablet: { width: 600, height: 400 },
    desktop: { width: 400, height: 600 },
  })

  const isOpen = !!recipeId

  // Use passed theme or fallback to context theme
  const theme = propTheme || contextTheme

  // Fixed servings: Always sync with the recipe's default
  useEffect(() => {
    if (recipe?.servings) {
      setServings(parseInt(recipe.servings.toString()) || 1)
    }
  }, [recipe?.servings])

  const handleAddToCart = async () => {
    if (!recipe) return
    setIsAdding(true)
    try {
      await onAddToCart(recipe, servings)
      onClose()
    } finally {
      setIsAdding(false)
    }
  }

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case "beginner":
        return "bg-green-100 text-green-800"
      case "intermediate":
        return "bg-yellow-100 text-yellow-800"
      case "advanced":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const totalTime = recipe ? (recipe.prep_time || 0) + (recipe.cook_time || 0) : 0

  // Use passed classes or derive from theme
  const bgClass = propBgClass || (theme === "dark" ? "bg-[#181813]" : "bg-gradient-to-br from-orange-50 to-yellow-50")
  const textClass = propTextClass || (theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900")
  const mutedTextClass = propMutedTextClass || (theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600")
  const cardBgClass = theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white/80"
  const buttonClass = propButtonClass || (theme === "dark" ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]" : "bg-orange-500 hover:bg-orange-600 text-white")
  const borderClass = theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"
  const iconClass = theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"

  if (!isOpen || (!recipe && !isLoading)) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-4xl max-h-[90vh] p-0 overflow-hidden border-none ${cardBgClass}`}>
        <div className="flex flex-col md:flex-row max-h-[90vh]">
          {isLoading || !recipe ? (
            <>
              <DialogTitle className="sr-only">Recipe details</DialogTitle>
              <div className={`flex items-center justify-center py-24 w-full ${cardBgClass}`}>
                <div className={`h-8 w-8 animate-spin rounded-full border-2 ${theme === "dark" ? "border-[#e8dcc4]" : "border-orange-500"} border-t-transparent`} />
              </div>
            </>
          ) : (
            <>
              {/* Hero Image Section */}
              <div className="relative w-full h-40 md:w-80 md:h-auto flex-shrink-0">
                <Image
                  src={getRecipeImageUrl(recipe.content?.image_url) || "/placeholder.svg"}
                  alt={recipe.title}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 768px) 100vw, 320px"
                />
              </div>

              {/* Content Area */}
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 -webkit-overflow-scrolling-touch">
                  {/* Title & Description */}
                  <header className="space-y-3">
                    <DialogTitle className={`text-2xl md:text-3xl font-serif font-light ${textClass}`}>
                      {recipe.title}
                    </DialogTitle>
                    {recipe.content?.description && (
                      <p className={`text-sm leading-relaxed ${mutedTextClass}`}>
                        {recipe.content.description}
                      </p>
                    )}
                  </header>

                  {/* Primary Stats */}
                  <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 border-y ${borderClass}`}>
                    <StatCard
                        icon={<Clock className={`h-4 w-4 ${iconClass}`} />}
                        label="Time"
                        value={`${totalTime}m`}
                        theme={theme}
                    />
                    <StatCard
                        icon={<Users className={`h-4 w-4 ${iconClass}`} />}
                        label="Servings"
                        value={servings}
                        theme={theme}
                    />
                    <div className="flex flex-col gap-1">
                      <span className={`text-[10px] uppercase tracking-wider font-bold ${mutedTextClass}`}>Difficulty</span>
                      <Badge variant="secondary" className={`w-fit px-2 py-0 text-[10px] font-bold uppercase ${getDifficultyColor(recipe.difficulty?.toLowerCase() || "")}`}>
                        {recipe.difficulty || "Easy"}
                      </Badge>
                    </div>
                    {recipe.rating_avg && recipe.rating_avg > 0 && (
                      <StatCard
                        icon={<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
                        label="Rating"
                        value={recipe.rating_avg.toFixed(1)}
                        theme={theme}
                      />
                    )}
                  </div>

                  {/* Nutrition Grid */}
                  {recipe.nutrition && (
                    <section className="space-y-4">
                      <h3 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${textClass}`}>
                        <Zap className={`h-3 w-3 ${iconClass}`} />
                        Nutrition <span className={`text-[10px] font-normal lowercase ${mutedTextClass} tracking-normal`}>(per serving)</span>
                      </h3>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <NutritionCard label="Calories" value={recipe.nutrition.calories} unit="" theme={theme} />
                        <NutritionCard label="Protein" value={recipe.nutrition.protein} unit="g" theme={theme} />
                        <NutritionCard label="Carbs" value={recipe.nutrition.carbs} unit="g" theme={theme} />
                        <NutritionCard label="Fat" value={recipe.nutrition.fat} unit="g" theme={theme} />
                      </div>
                    </section>
                  )}

                  {/* Ingredients Preview */}
                  {recipe.ingredients && recipe.ingredients.length > 0 && (
                    <section className="space-y-4">
                      <h3 className={`text-xs font-bold uppercase tracking-widest ${textClass}`}>Ingredients Preview</h3>
                      <ul className="grid grid-cols-1 gap-3">
                        {recipe.ingredients.slice(0, 6).map((ing: any, idx: number) => (
                          <li key={idx} className={`flex items-start gap-3 text-sm ${mutedTextClass}`}>
                            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${theme === "dark" ? "bg-[#e8dcc4]/60" : "bg-orange-500/60"}`} />
                            <span><span className={`font-semibold ${textClass}`}>{ing.amount} {ing.unit}</span> {ing.name}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>

                {/* Footer Actions */}
                <footer className={`p-6 border-t ${borderClass} ${theme === "dark" ? "bg-[#1f1e1a]/50" : "bg-orange-50/50"} flex items-center justify-between mt-auto`}>
                  <Link
                    href={`/recipes/${recipe.id}`}
                    className={`group text-sm font-bold ${theme === "dark" ? "text-[#e8dcc4]" : "text-orange-600"} flex items-center gap-1 hover:underline`}
                  >
                    View Directions
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Button
                    onClick={handleAddToCart}
                    disabled={isAdding}
                    className={`${buttonClass} px-8 rounded-full font-bold transition-all active:scale-95`}
                  >
                    {isAdding ? "Adding..." : "Add to List"}
                  </Button>
                </footer>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ icon, label, value, theme }: { icon: React.ReactNode; label: string; value: string | number; theme: string }) {
  const mutedTextClass = theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600"
  const textClass = theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className={`text-[10px] uppercase tracking-wider font-bold ${mutedTextClass}`}>{label}</span>
      </div>
      <span className={`text-sm font-bold ${textClass}`}>{value}</span>
    </div>
  )
}

function NutritionCard({ label, value, unit, theme }: { label: string; value: number | string; unit: string; theme: string }) {
  const borderClass = theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"
  const cardBgClass = theme === "dark" ? "bg-[#1f1e1a]" : "bg-white"
  const mutedTextClass = theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600"
  const textClass = theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"

  return (
    <div className={`flex flex-col items-center justify-center p-3 rounded-xl border ${borderClass} ${cardBgClass} shadow-sm`}>
      <span className={`text-[9px] uppercase font-bold ${mutedTextClass} mb-0.5`}>{label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className={`text-base font-extrabold ${textClass}`}>{value}</span>
        <span className={`text-[10px] font-medium ${mutedTextClass}`}>{unit}</span>
      </div>
    </div>
  )
}