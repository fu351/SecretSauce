"use client"

import { Heart, Leaf, Flame, TreePine, Zap, Apple, Droplet } from "lucide-react"
import { DIETARY_TAGS } from "@/lib/types/recipe"
import type { DietaryTag } from "@/lib/types/recipe"
import { formatDietaryTag } from "@/lib/tag-formatter"

// Map dietary tags to icons
const tagIconMap: Record<DietaryTag, React.ComponentType<any>> = {
  vegetarian: Leaf,
  vegan: TreePine,
  "gluten-free": Flame,
  "dairy-free": Droplet,
  keto: Zap,
  paleo: Apple,
  "low-carb": Flame,
  other: Leaf,
}

const filters = [
  { tag: "favorites" as const, icon: Heart, label: "Favorites", active: true },
  ...DIETARY_TAGS.map(tag => ({
    tag,
    icon: tagIconMap[tag] || Leaf,
    label: formatDietaryTag(tag),
    active: false,
  })),
]

export function SearchFilters() {
  return (
    <div className="flex flex-wrap justify-center gap-4 py-8">
      {filters.map((filter, index) => {
        const Icon = filter.icon
        return (
          <button
            type="button"
            aria-label={filter.label}
            title={filter.label}
            key={index}
            className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-colors ${
              filter.active
                ? "bg-pink-100 border-pink-300 text-pink-600"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            <Icon className="h-5 w-5" />
          </button>
        )
      })}
    </div>
  )
}
