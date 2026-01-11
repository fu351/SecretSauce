"use client"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { ProteinTag } from "@/lib/types/recipe"
import {
  Bird,
  Beef,
  Egg,
  Fish,
  Leaf,
  Circle,
  Shell,
} from "lucide-react"

interface ProteinTagDisplayProps {
  protein: ProteinTag
}

const proteinIcons: Record<ProteinTag, React.ComponentType<any>> = {
  chicken: Bird,
  beef: Beef,
  pork: Beef,
  fish: Fish,
  shellfish: Shell,
  turkey: Bird,
  tofu: Leaf,
  legume: Leaf,
  egg: Egg,
  other: Circle,
}

const proteinLabels: Record<ProteinTag, string> = {
  chicken: "Chicken",
  beef: "Beef",
  pork: "Pork",
  fish: "Fish",
  shellfish: "Shellfish",
  turkey: "Turkey",
  tofu: "Tofu",
  legume: "Legume",
  egg: "Egg",
  other: "Other",
}

/**
 * Read-only display of the main protein type
 * Shows auto-detected protein classification
 */
export function ProteinTagDisplay({ protein }: ProteinTagDisplayProps) {
  const Icon = proteinIcons[protein]

  return (
    <div>
      <Label className="text-sm font-medium text-muted-foreground">
        Main Protein (Auto-detected)
      </Label>
      <Badge
        variant="secondary"
        className="mt-2 bg-blue-100 text-blue-900 border-blue-300"
      >
        <Icon className="h-3 w-3 mr-1" />
        {proteinLabels[protein]}
      </Badge>
    </div>
  )
}
