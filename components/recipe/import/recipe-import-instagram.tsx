"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { useToast } from "@/hooks"
import type { ImportedRecipe, RecipeImportResponse } from "@/lib/types/recipe-imports"

interface RecipeImportInstagramProps {
  onImportSuccess: (recipe: ImportedRecipe) => void
  disabled?: boolean
}

export function RecipeImportInstagram({ onImportSuccess, disabled }: RecipeImportInstagramProps) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleImport = async () => {
    if (!url.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter an Instagram URL.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/recipe-import/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      const data: RecipeImportResponse = await response.json()

      if (!data.success || !data.recipe) {
        throw new Error(data.error || "Failed to import from Instagram")
      }

      toast({
        title: "Recipe imported from Instagram",
        description: "Review the details below and save when ready.",
      })

      onImportSuccess(data.recipe)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import from Instagram"
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
        <Label htmlFor="instagram-url">Instagram Post URL</Label>
        <Input
          id="instagram-url"
          placeholder="https://www.instagram.com/p/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading || disabled}
        />
        <p className="text-sm text-muted-foreground mt-1">
          Paste a link to an Instagram post, reel, or video with a recipe in the caption
        </p>
      </div>
      <Button onClick={handleImport} disabled={loading || !url || disabled}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Importing...
          </>
        ) : (
          "Import from Instagram"
        )}
      </Button>
    </div>
  )
}
