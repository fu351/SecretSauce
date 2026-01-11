"use client"

import { DietaryTagSelector } from "./dietary-tag-selector"
import { AllergenTagDisplay } from "./allergen-tag-display"
import { ProteinTagDisplay } from "./protein-tag-display"
import { MealTypeTagDisplay } from "./meal-type-tag-display"
import { CuisineTagDisplay } from "./cuisine-tag-display"
import { RecipeTags, DietaryTag } from "@/lib/types/recipe"

interface TagSelectorProps {
  // Current tag values
  tags: RecipeTags

  // Callback for dietary tag changes (only editable type)
  onDietaryTagsChange?: (tags: DietaryTag[]) => void

  // Mode: 'view' (read-only) or 'edit' (dietary tags editable)
  mode: "view" | "edit"

  // Optional: show/hide specific tag sections
  sections?: {
    dietary?: boolean
    allergens?: boolean
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
    dietary: true,
    allergens: true,
    protein: true,
    mealType: true,
    cuisine: true,
  },
}: TagSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Dietary Tags - User Editable */}
      {sections.dietary && (
        <DietaryTagSelector
          selectedTags={tags.dietary}
          onChange={onDietaryTagsChange}
          mode={mode}
        />
      )}

      {/* Allergen Tags - Read-only, Auto-generated */}
      {sections.allergens && tags.allergens && (
        <AllergenTagDisplay allergens={tags.allergens} />
      )}

      {/* Protein Tag - Read-only, Auto-generated */}
      {sections.protein && tags.protein && (
        <ProteinTagDisplay protein={tags.protein} />
      )}

      {/* Meal Type Tag - Read-only, Auto-generated */}
      {sections.mealType && tags.meal_type && (
        <MealTypeTagDisplay mealType={tags.meal_type} />
      )}

      {/* Cuisine Guess - Read-only, Auto-generated */}
      {sections.cuisine && tags.cuisine_guess && (
        <CuisineTagDisplay cuisine={tags.cuisine_guess} />
      )}
    </div>
  )
}
