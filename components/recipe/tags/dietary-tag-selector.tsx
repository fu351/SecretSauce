"use client"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { formatDietaryTag } from "@/lib/tag-formatter"
import { DIETARY_TAGS, DietaryTag } from "@/lib/types/recipe"
import { cn } from "@/lib/utils"

interface DietaryTagSelectorProps {
  selectedTags: DietaryTag[]
  onChange?: (tags: DietaryTag[]) => void
  mode: "view" | "edit"
}

/**
 * Component for selecting dietary tags
 * Allows users to toggle dietary restrictions in edit mode
 * Read-only display in view mode
 */
export function DietaryTagSelector({
  selectedTags,
  onChange,
  mode,
}: DietaryTagSelectorProps) {
  const toggleTag = (tag: DietaryTag) => {
    if (mode === "view" || !onChange) return

    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((t) => t !== tag))
    } else {
      onChange([...selectedTags, tag])
    }
  }

  return (
    <div>
      <Label className="text-sm font-medium">Dietary Tags</Label>
      <div className="flex flex-wrap gap-2 mt-2">
        {DIETARY_TAGS.map((tag) => (
          <Badge
            key={tag}
            variant={selectedTags.includes(tag) ? "default" : "outline"}
            className={cn(
              mode === "edit" &&
                "cursor-pointer hover:opacity-80 transition-opacity",
              mode === "view" && "cursor-default"
            )}
            onClick={() => toggleTag(tag)}
          >
            {formatDietaryTag(tag)}
          </Badge>
        ))}
      </div>
    </div>
  )
}
