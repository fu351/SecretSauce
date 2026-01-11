"use client"

import { Heart, Leaf, Flame, TreePine, Zap, Apple, Droplet, Globe } from "lucide-react"
import { DIETARY_TAGS, CUISINE_TYPES } from "@/lib/types/recipe"
import type { DietaryTag, CuisineType } from "@/lib/types/recipe"
import { formatDietaryTag } from "@/lib/tag-formatter"

// Format cuisine type for display (capitalize and handle hyphens)
const formatCuisineType = (cuisine: string): string => {
  return cuisine
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface FilterOption {
  tag: string
  icon: React.ComponentType<any>
  label: string
  active: boolean
  category: 'favorites' | 'dietary' | 'cuisine'
}

const dietaryFilters: FilterOption[] = DIETARY_TAGS.map(tag => ({
  tag,
  icon: tagIconMap[tag] || Leaf,
  label: formatDietaryTag(tag),
  active: false,
  category: 'dietary' as const,
}))

interface SearchFiltersProps {
  availableCuisines?: string[]
}

export function SearchFilters({ availableCuisines }: SearchFiltersProps) {
  // Use provided cuisines or fall back to all cuisine types from constants
  const displayCuisines = availableCuisines && availableCuisines.length > 0
    ? availableCuisines
    : CUISINE_TYPES

  const dynamicCuisineFilters: FilterOption[] = displayCuisines.map(cuisine => ({
    tag: cuisine,
    icon: cuisineIconMap[cuisine as CuisineType] || Globe,
    label: formatCuisineType(cuisine),
    active: false,
    category: 'cuisine' as const,
  }))

  return (
    <div className="space-y-6 py-8">
      {/* Favorites Filter */}
      <div className="flex flex-wrap justify-center gap-4">
        <button
          type="button"
          aria-label="Favorites"
          title="Favorites"
          className="flex items-center justify-center w-12 h-12 rounded-full border-2 transition-colors bg-pink-100 border-pink-300 text-pink-600"
        >
          <Heart className="h-5 w-5" />
        </button>
      </div>

      {/* Dietary Tags Section */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 text-center mb-3">Dietary</h3>
        <div className="flex flex-wrap justify-center gap-4">
          {dietaryFilters.map((filter) => {
            const Icon = filter.icon
            return (
              <button
                type="button"
                aria-label={filter.label}
                title={filter.label}
                key={filter.tag}
                className="flex items-center justify-center w-12 h-12 rounded-full border-2 transition-colors bg-white border-gray-200 text-gray-600 hover:border-orange-300"
              >
                <Icon className="h-5 w-5" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Cuisine Types Section */}
      {displayCuisines.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 text-center mb-3">Cuisine</h3>
          <div className="flex flex-wrap justify-center gap-4">
            {dynamicCuisineFilters.map((filter) => {
              const Icon = filter.icon
              return (
                <button
                  type="button"
                  aria-label={filter.label}
                  title={filter.label}
                  key={filter.tag}
                  className="flex items-center justify-center w-12 h-12 rounded-full border-2 transition-colors bg-white border-gray-200 text-gray-600 hover:border-blue-300"
                >
                  <Icon className="h-5 w-5" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
