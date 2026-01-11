"use client"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { AllergenTags } from "@/lib/types"
import {
  Droplet,
  Wheat,
  AlertCircle,
  Fish,
  Egg,
  Sprout,
} from "lucide-react"

interface AllergenTagDisplayProps {
  allergens: AllergenTags
}

const allergenLabels: Record<keyof AllergenTags, string> = {
  contains_dairy: "Dairy",
  contains_gluten: "Gluten",
  contains_nuts: "Nuts",
  contains_shellfish: "Shellfish",
  contains_egg: "Egg",
  contains_soy: "Soy",
}

const allergenIcons: Record<keyof AllergenTags, React.ComponentType<any>> = {
  contains_dairy: Droplet,
  contains_gluten: Wheat,
  contains_nuts: AlertCircle,
  contains_shellfish: Fish,
  contains_egg: Egg,
  contains_soy: Sprout,
}

/**
 * Read-only display of allergens present in the recipe
 * Shows auto-detected allergens with warning styling
 */
export function AllergenTagDisplay({ allergens }: AllergenTagDisplayProps) {
  const presentAllergens = (
    Object.entries(allergens) as Array<[keyof AllergenTags, boolean]>
  )
    .filter(([_, present]) => present)
    .map(([key, _]) => key)

  if (presentAllergens.length === 0) return null

  return (
    <div>
      <Label className="text-sm font-medium text-muted-foreground">
        Contains (Auto-detected)
      </Label>
      <div className="flex flex-wrap gap-2 mt-2">
        {presentAllergens.map((allergen) => {
          const Icon = allergenIcons[allergen]
          return (
            <Badge
              key={allergen}
              variant="secondary"
              className="bg-amber-100 text-amber-900 border-amber-300"
            >
              <Icon className="h-3 w-3 mr-1" />
              {allergenLabels[allergen]}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}
