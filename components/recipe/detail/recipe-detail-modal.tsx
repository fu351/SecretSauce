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

interface RecipeDetailModalProps {
  recipeId: string | null
  onClose: () => void
  onAddToCart: (recipe: Recipe, servings: number) => Promise<void>
}

export function RecipeDetailModal({
  recipeId,
  onClose,
  onAddToCart,
}: RecipeDetailModalProps) {
  const [servings, setServings] = useState(1)
  const [isAdding, setIsAdding] = useState(false)
  const { data: recipe, isLoading } = useRecipe(recipeId)
  
  const imageConfig = useResponsiveImage({
    mobile: { width: 400, height: 250 },
    tablet: { width: 600, height: 400 },
    desktop: { width: 400, height: 600 },
  })

  const isOpen = !!recipeId

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

  const difficultyStyles: Record<string, string> = {
    beginner: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    intermediate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    advanced: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  }

  const totalTime = recipe ? (recipe.prep_time || 0) + (recipe.cook_time || 0) : 0

  if (!isOpen || (!recipe && !isLoading)) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden border-none bg-white dark:bg-neutral-950">
        <div className="flex flex-col md:flex-row h-full">
          {isLoading || !recipe ? (
            <div className="flex items-center justify-center py-24 w-full bg-white dark:bg-neutral-950">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {/* Hero Image Section */}
              <div className="relative w-full h-56 md:w-80 md:h-auto flex-shrink-0">
                <Image
                  src={getRecipeImageUrl(recipe.image_url) || "/placeholder.svg"}
                  alt={recipe.title}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 768px) 100vw, 320px"
                />
              </div>

              {/* Content Area */}
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
                  {/* Title & Description */}
                  <header className="space-y-3">
                    <DialogTitle className="text-2xl md:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">
                      {recipe.title}
                    </DialogTitle>
                    {recipe.description && (
                      <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                        {recipe.description}
                      </p>
                    )}
                  </header>

                  {/* Primary Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 border-y border-neutral-100 dark:border-neutral-800">
                    <StatCard 
                        icon={<Clock className="h-4 w-4 text-orange-500" />} 
                        label="Time" 
                        value={`${totalTime}m`} 
                    />
                    <StatCard 
                        icon={<Users className="h-4 w-4 text-orange-500" />} 
                        label="Servings" 
                        value={servings} 
                    />
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">Difficulty</span>
                      <Badge variant="secondary" className={`w-fit px-2 py-0 text-[10px] font-bold uppercase ${difficultyStyles[recipe.difficulty?.toLowerCase() || ""] || ""}`}>
                        {recipe.difficulty || "Easy"}
                      </Badge>
                    </div>
                    {recipe.rating_avg > 0 && (
                      <StatCard 
                        icon={<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />} 
                        label="Rating" 
                        value={recipe.rating_avg.toFixed(1)} 
                      />
                    )}
                  </div>

                  {/* Nutrition Grid */}
                  {recipe.nutrition && (
                    <section className="space-y-4">
                      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-900 dark:text-neutral-100">
                        <Zap className="h-3 w-3 text-orange-500" />
                        Nutrition <span className="text-[10px] font-normal lowercase text-neutral-400 tracking-normal">(per serving)</span>
                      </h3>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <NutritionCard label="Calories" value={recipe.nutrition.calories} unit="" />
                        <NutritionCard label="Protein" value={recipe.nutrition.protein} unit="g" />
                        <NutritionCard label="Carbs" value={recipe.nutrition.carbs} unit="g" />
                        <NutritionCard label="Fat" value={recipe.nutrition.fat} unit="g" />
                      </div>
                    </section>
                  )}

                  {/* Ingredients Preview */}
                  <section className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-900 dark:text-neutral-100">Ingredients Preview</h3>
                    <ul className="grid grid-cols-1 gap-3">
                      {recipe.ingredients?.slice(0, 6).map((ing: any, idx: number) => (
                        <li key={idx} className="flex items-start gap-3 text-sm text-neutral-600 dark:text-neutral-300">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500/60" />
                          <span><span className="font-semibold text-neutral-900 dark:text-neutral-100">{ing.amount} {ing.unit}</span> {ing.name}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>

                {/* Footer Actions */}
                <footer className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex items-center justify-between mt-auto">
                  <Link
                    href={`/recipes/${recipe.id}`}
                    className="group text-sm font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1 hover:underline"
                  >
                    View Directions
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Button 
                    onClick={handleAddToCart} 
                    disabled={isAdding} 
                    className="bg-orange-600 hover:bg-orange-700 text-white px-8 rounded-full font-bold transition-all active:scale-95"
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">{label}</span>
      </div>
      <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{value}</span>
    </div>
  )
}

function NutritionCard({ label, value, unit }: { label: string; value: number | string; unit: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
      <span className="text-[9px] uppercase font-bold text-neutral-400 mb-0.5">{label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className="text-base font-extrabold text-neutral-900 dark:text-neutral-50">{value}</span>
        <span className="text-[10px] font-medium text-neutral-500">{unit}</span>
      </div>
    </div>
  )
}