"use client"

import { DietaryTagSelector } from "./dietary-tag-selector"
import { ProteinTagDisplay } from "./protein-tag-display"
import { MealTypeTagDisplay } from "./meal-type-tag-display"
import { RecipeTags, DietaryTag, ProteinTag, MealTypeTag } from "@/lib/types"

interface TagSelectorProps {
  // Current tag values (optional, will use empty defaults if not provided)
  tags?: RecipeTags
  protein?: ProteinTag
  mealType?: MealTypeTag

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
  protein,
  mealType,
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
  const safeTags = tags || []

  return (
    <div className="space-y-4">
      {/* Dietary Tags - User Editable */}
      {sections.tags && (
        <DietaryTagSelector
          selectedTags={safeTags}
          onChange={onDietaryTagsChange}
          mode={mode}
        />
      )}

      {/* Protein Tag - Read-only, Auto-generated */}
      {sections.protein && protein && (
        <ProteinTagDisplay protein={protein} />
      )}

      {/* Meal Type Tag - Read-only, Auto-generated */}
      {sections.mealType && mealType && (
        <MealTypeTagDisplay mealType={mealType} />
      )}
    </div>
  )
}
