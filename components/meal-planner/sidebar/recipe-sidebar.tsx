"use client"

import { Button } from "@/components/ui/button"
import { X, ChevronRightIcon } from "lucide-react"
import { FavoriteRecipesSection } from "./favorite-recipes-section"
import { SuggestedRecipesSection } from "./suggested-recipes-section"
import type { Recipe } from "@/lib/types"
import { useTheme } from "@/contexts/theme-context"

interface RecipeSidebarProps {
  open: boolean
  onToggle: () => void
  favoriteRecipes: Recipe[]
  suggestedRecipes: Recipe[]
  onDragStart: (recipe: Recipe) => void
  onRecipeClick: (recipe: Recipe) => void
  isMobile: boolean
}

function getSidebarClassName(isMobile: boolean, sidebarOpen: boolean) {
  if (isMobile) {
    return sidebarOpen
      ? "fixed top-16 left-0 right-0 bottom-0 z-50 flex flex-col max-h-screen overflow-y-auto"
      : "hidden"
  } else {
    return sidebarOpen
      ? "w-80 md:w-96 max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
      : "w-0 max-h-[calc(100vh-2rem)]"
  }
}

export function RecipeSidebar({
  open,
  onToggle,
  favoriteRecipes,
  suggestedRecipes,
  onDragStart,
  onRecipeClick,
  isMobile,
}: RecipeSidebarProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const sidebarClassName = getSidebarClassName(isMobile, open)
  const stickySidebarClass = isMobile ? "" : "md:sticky md:top-6 md:h-[calc(100vh-3rem)] md:self-start"

  return (
    <div
      className={`${sidebarClassName} ${stickySidebarClass} bg-card border-border ${
        isMobile ? "" : "border-l"
      } flex-shrink-0 transition-all duration-300 relative`}
    >
      {!isMobile && (
        <button
          data-tutorial="planner-sidebar"
          onClick={onToggle}
          className={`absolute -left-8 top-4 ${
            isDark ? "bg-accent text-accent-foreground hover:bg-accent/90" : "bg-primary text-primary-foreground hover:bg-primary/90"
          } rounded-xl p-2 shadow-lg z-20 transition-all border border-border`}
          aria-label={open ? "Hide recipes sidebar" : "Show recipes sidebar"}
        >
          {open ? <ChevronRightIcon className="h-5 w-5" /> : "→"}
        </button>
      )}

      {open && (
        <div className="flex h-full flex-col">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border p-4 md:p-6 bg-card">
            <h3 className={`text-base md:text-lg font-semibold text-text`}>Recipes</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8"
              aria-label="Hide recipes sidebar"
            >
              {isMobile ? <X className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide p-4 md:p-6 space-y-6">
            <FavoriteRecipesSection
              recipes={favoriteRecipes}
              onDragStart={onDragStart}
              onClick={onRecipeClick}
              isMobile={isMobile}
            />

            <SuggestedRecipesSection
              recipes={suggestedRecipes}
              onDragStart={onDragStart}
              onClick={onRecipeClick}
              isMobile={isMobile}
            />
          </div>
        </div>
      )}
    </div>
  )
}
