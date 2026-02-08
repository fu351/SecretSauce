"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks"
import type { ImportedRecipe, RecipeImportResponse } from "@/lib/types"

interface RecipeImportInstagramProps {
  onImportSuccess: (recipe: ImportedRecipe) => void
  disabled?: boolean
  /** Pre-fill URL when opened via share link (e.g. /upload-recipe?import=instagram&url=...) */
  initialUrl?: string
}

export function RecipeImportInstagram({ onImportSuccess, disabled, initialUrl }: RecipeImportInstagramProps) {
  const [url, setUrl] = useState(initialUrl ?? "")
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (initialUrl != null && initialUrl.trim()) setUrl(initialUrl.trim())
  }, [initialUrl])

  const handleImport = async () => {
    if (!url.trim()) {
      setErrorMessage("Please enter an Instagram URL.")
      toast({
        title: "Missing information",
        description: "Please enter an Instagram URL.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    setErrorMessage(null)

    try {
      const response = await fetch("/api/recipe-import/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })

      const data: RecipeImportResponse = await response.json().catch(() => ({
        success: false,
        error: "Invalid response from server. Please try again.",
      }))

      if (!data.success || !data.recipe) {
        const message =
          data.error ||
          (response.status === 500 ? "Import service error. Please try again later." : "Failed to import from Instagram.")
        setErrorMessage(message)
        toast({
          title: "Import failed",
          description: message,
          variant: "destructive",
        })
        return
      }

      setErrorMessage(null)
      toast({
        title: "Recipe imported from Instagram",
        description: "Review the details below and save when ready.",
      })

      onImportSuccess(data.recipe)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to import from Instagram. Please try again."
      setErrorMessage(message)
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
          onChange={(e) => {
            setUrl(e.target.value)
            setErrorMessage(null)
          }}
          disabled={loading || disabled}
        />
        <p className="text-sm text-muted-foreground mt-1">
          Paste a link to a <strong>public</strong> post, reel, or video whose caption contains the
          full recipe (ingredients and instructions).
        </p>
      </div>

      {errorMessage && (
        <Alert variant="destructive" className="flex gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Button onClick={handleImport} disabled={loading || !url.trim() || disabled}>
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
