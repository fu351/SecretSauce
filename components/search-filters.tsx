"use client"

import { Heart, Clock, Utensils, Users, Leaf, Zap, Sun, RotateCcw, Lightbulb } from "lucide-react"

const filters = [
  { icon: Heart, label: "Favorites", active: true },
  { icon: Clock, label: "Quick" },
  { icon: Utensils, label: "Easy" },
  { icon: Users, label: "Family" },
  { icon: Leaf, label: "Healthy" },
  { icon: Zap, label: "Energy" },
  { icon: Sun, label: "Fresh" },
  { icon: RotateCcw, label: "Comfort" },
  { icon: Lightbulb, label: "Creative" },
]

export function SearchFilters() {
  return (
    <div className="flex justify-center gap-4 py-8">
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
