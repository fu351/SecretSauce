"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { useToast } from "@/hooks"
import type { ImportedRecipe, RecipeImportResponse } from "@/lib/types"

interface RecipeImportUrlProps {
  onImportSuccess: (recipe: ImportedRecipe) => void
  disabled?: boolean
}

export function RecipeImportUrl({ onImportSuccess, disabled }: RecipeImportUrlProps) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleImport = async () => {
    if (!url.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter a recipe URL.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/recipe-import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      const data: RecipeImportResponse = await response.json()

      if (!data.success || !data.recipe) {
        throw new Error(data.error || "Failed to import recipe")
      }

      toast({
        title: "Recipe imported",
        description: "Review the details below and save when ready.",
      })

      onImportSuccess(data.recipe)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import recipe"
      toast({
        title: "Import failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="recipe-url">Recipe URL</Label>
        <Input
          id="recipe-url"
          placeholder="https://www.allrecipes.com/recipe/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading || disabled}
        />
        <p className="text-sm text-muted-foreground mt-1">
          Supports 400+ recipe websites including AllRecipes, Food Network, and more
        </p>
      </div>
      <Button onClick={handleImport} disabled={loading || !url || disabled}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Importing...
          </>
        ) : (
          "Import from URL"
        )}
      </Button>
    </div>
  )
}
