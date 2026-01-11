"use client"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Globe } from "lucide-react"

interface CuisineTagDisplayProps {
  cuisine: string
}

/**
 * Read-only display of AI-detected cuisine
 * Shows as an outline badge to indicate it's an AI guess
 */
export function CuisineTagDisplay({ cuisine }: CuisineTagDisplayProps) {
  return (
    <div>
      <Label className="text-sm font-medium text-muted-foreground">
        Cuisine (AI Guess)
      </Label>
      <Badge variant="outline" className="mt-2">
        <Globe className="h-3 w-3 mr-1" />
        {cuisine.charAt(0).toUpperCase() + cuisine.slice(1)}
      </Badge>
    </div>
  )
}
