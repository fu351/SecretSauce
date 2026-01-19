"use client"

import { DietaryTagSelector } from "./dietary-tag-selector"
import { ProteinTagDisplay } from "./protein-tag-display"
import { MealTypeTagDisplay } from "./meal-type-tag-display"
import { RecipeTags, DietaryTag } from "@/lib/types"

interface TagSelectorProps {
  // Current tag values (optional, will use empty defaults if not provided)
  tags?: RecipeTags

  // Callback for dietary tag changes (only editable type)
  onDietaryTagsChange?: (tags: DietaryTag[]) => void

  // Mode: 'view' (read-only) or 'edit' (dietary tags editable)
  mode: "view" | "edit"

  // Optional: show/hide specific tag sections
  sections?: {
    tags?: boolean
    protein?: boolean
    mealType?: boolean
    cuisine?: boolean
  }
}

/**
 * Parent component that orchestrates all tag display and editing
 * Manages dietary tags (user-editable) and auto-generated tags (read-only)
 */
export function TagSelector({
  tags,
  onDietaryTagsChange,
  mode = "view",
  sections = {
    tags: true,
    protein: true,
    mealType: true,
    cuisine: true,
  },
}: TagSelectorProps) {
  // Provide default empty tags if not provided
  const safeTags = tags || { dietary: [] }

  return (
    <div className="space-y-4">
      {/* Dietary Tags - User Editable */}
      {sections.tags && (
        <DietaryTagSelector
          selectedTags={safeTags.dietary}
          onChange={onDietaryTagsChange}
          mode={mode}
        />
      )}

      {/* Protein Tag - Read-only, Auto-generated */}
      {sections.protein && safeTags.protein && (
        <ProteinTagDisplay protein={safeTags.protein} />
      )}

      {/* Meal Type Tag - Read-only, Auto-generated */}
      {sections.mealType && safeTags.meal_type && (
        <MealTypeTagDisplay mealType={safeTags.meal_type} />
      )}
    </div>
  )
}
