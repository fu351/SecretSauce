export interface UnitCanonicalOption {
  value: string
  label: string
  category: "weight" | "volume" | "count" | "other"
}

export const UNIT_CANONICAL_OPTIONS: UnitCanonicalOption[] = [
  { value: "oz", label: "oz", category: "weight" },
  { value: "lb", label: "lb", category: "weight" },
  { value: "g", label: "g", category: "weight" },
  { value: "fl oz", label: "fl oz", category: "volume" },
  { value: "ml", label: "ml", category: "volume" },
  { value: "gal", label: "gal", category: "volume" },
  { value: "ct", label: "ct", category: "count" },
  { value: "each", label: "each", category: "count" },
  { value: "bunch", label: "bunch", category: "count" },
  { value: "unit", label: "unit", category: "other" },
  { value: "tsp", label: "tsp", category: "volume" },
  { value: "tbsp", label: "tbsp", category: "volume" },
  { value: "cup", label: "cup", category: "volume" },
]
