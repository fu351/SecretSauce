"use client"

import type React from "react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Upload, X, Loader2 } from "lucide-react"
import Image from "next/image"
import { useToast } from "@/hooks"
import { performOCR } from "@/lib/ocr-service"
import type { ImportedRecipe, RecipeImportResponse } from "@/lib/types/recipe-imports"

interface RecipeImportImageProps {
  onImportSuccess: (recipe: ImportedRecipe) => void
  disabled?: boolean
}

export function RecipeImportImage({ onImportSuccess, disabled }: RecipeImportImageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const { toast } = useToast()

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handleImport = async () => {
    if (!imageFile) {
      toast({
        title: "Missing information",
        description: "Please select an image.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    setOcrProgress(0)

    try {
      // Perform OCR
      const ocrResult = await performOCR(imageFile, setOcrProgress)

      if (!ocrResult.text || ocrResult.text.trim().length < 20) {
        throw new Error("Could not extract enough text from the image. Please try a clearer image.")
      }

      // Send to backend for AI parsing
      const response = await fetch("/api/recipe-import/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ocrResult.text }),
      })

      const data: RecipeImportResponse = await response.json()

      if (!data.success || !data.recipe) {
        throw new Error(data.error || "Failed to parse recipe from image")
      }

      // Low confidence warning
      if (ocrResult.confidence < 70) {
        toast({
          title: "Recipe imported with low confidence",
          description: "OCR confidence was low. Please review all fields carefully.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Recipe imported from image",
          description: "Review the details below and save when ready.",
        })
      }

      onImportSuccess(data.recipe)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import from image"
      toast({
        title: "Import failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setOcrProgress(0)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Recipe Image</Label>
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview ? (
            <div className="relative">
              <Image
                src={imagePreview}
                alt="Recipe preview"
                width={300}
                height={200}
                className="mx-auto rounded object-cover"
              />
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={(e) => {
                  e.stopPropagation()
                  setImageFile(null)
                  setImagePreview("")
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p>Click to upload or drag and drop</p>
              <p className="text-sm text-muted-foreground">PNG, JPG up to 10MB</p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
          disabled={loading || disabled}
        />
      </div>
      {loading && ocrProgress > 0 && (
        <div className="space-y-2">
          <p className="text-sm">Processing image... {ocrProgress}%</p>
          <Progress value={ocrProgress} />
        </div>
      )}
      <Button onClick={handleImport} disabled={loading || !imageFile || disabled}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          "Extract Recipe from Image"
        )}
      </Button>
    </div>
  )
}
