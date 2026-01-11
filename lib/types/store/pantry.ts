/**
 * Pantry Item Information Type
 *
 * Represents an item stored in a user's pantry.
 * Includes quantity, unit, and standardization metadata.
 */
export interface PantryItemInfo {
  id: string
  quantity: number
  unit: string | null
  standardized_ingredient_id?: string | null
  standardized_name?: string | null
}
