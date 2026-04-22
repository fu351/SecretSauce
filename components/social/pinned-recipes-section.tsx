"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Pin } from "lucide-react"
import Image from "next/image"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { cn } from "@/lib/utils"
import type { Recipe } from "@/lib/types"

interface PinnedRecipesSectionProps {
  username: string
}

const MAX_VISIBLE_PINS = 3
export const PROFILE_PINS_UPDATED_EVENT = "profile:pins-updated"

export function PinnedRecipesSection({ username }: PinnedRecipesSectionProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const refreshPins = () => {
      setLoading(true)
      fetch(`/api/users/${encodeURIComponent(username)}/pinned-recipes`)
        .then((r) => r.json())
        .then(({ recipes: r }) => setRecipes(r ?? []))
        .catch(console.error)
        .finally(() => setLoading(false))
    }

    refreshPins()

    const handlePinsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ username?: string }>
      if (customEvent.detail?.username && customEvent.detail.username !== username) return
      refreshPins()
    }

    window.addEventListener(PROFILE_PINS_UPDATED_EVENT, handlePinsUpdated)
    return () => window.removeEventListener(PROFILE_PINS_UPDATED_EVENT, handlePinsUpdated)
  }, [username])

  if (loading || recipes.length === 0) return null

  const visibleRecipes = recipes.slice(0, MAX_VISIBLE_PINS)
  const remainingCount = recipes.length - visibleRecipes.length

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <Pin className="h-3.5 w-3.5" />
        <span>Pinned</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {visibleRecipes.map((recipe) => (
          <button
            key={recipe.id}
            type="button"
            onClick={() => router.push(`/recipes/${recipe.id}`)}
            className={cn(
              "group relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm",
              "aspect-[4/3] text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
            )}
          >
            <Image
              src={getRecipeImageUrl(recipe.content?.image_url || recipe.image_url) || "/placeholder.svg"}
              alt={recipe.title}
              fill
              sizes="(max-width: 640px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-2">
              <p className="line-clamp-2 text-xs font-medium leading-tight text-white drop-shadow">
                {recipe.title}
              </p>
            </div>
            <div className="absolute left-1.5 top-1.5 rounded-full bg-black/40 p-1 backdrop-blur-sm">
              <Pin className="h-2.5 w-2.5 fill-white text-white" />
            </div>
          </button>
        ))}
      </div>

      {remainingCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          +{remainingCount} more pinned recipe{remainingCount !== 1 ? "s" : ""}
        </p>
      ) : null}
    </section>
  )
}
