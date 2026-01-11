/**
 * Recipe Nutrition Information Type
 *
 * Stores nutritional information per serving or per recipe.
 * All fields are optional to support recipes without complete nutritional data.
 */
export interface NutritionInfo {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  sodium?: number
}
