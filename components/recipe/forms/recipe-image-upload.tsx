"use client"

import type React from "react"
import { useRef } from "react"
import clsx from "clsx"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LinkIcon, Upload, X } from "lucide-react"
import Image from "next/image"
import { useToast } from "@/hooks"
import { useTheme } from "@/contexts/theme-context"

interface RecipeImageUploadProps {
  mode: "url" | "file"
  imageUrl: string
  imageFile: File | null
  imagePreview: string
  onModeChange: (mode: "url" | "file") => void
  onUrlChange: (url: string) => void
  onFileChange: (file: File | null) => void
  onPreviewChange: (preview: string) => void
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export function RecipeImageUpload({
  mode,
  imageUrl,
  imageFile,
  imagePreview,
  onModeChange,
  onUrlChange,
  onFileChange,
  onPreviewChange,
}: RecipeImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const validateAndLoadFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPEG, PNG, WebP, or GIF).",
        variant: "destructive",
      })
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB.",
        variant: "destructive",
      })
      return
    }

    onFileChange(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      onPreviewChange(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      validateAndLoadFile(file)
    }
  }

  const clearImage = () => {
    onFileChange(null)
    onPreviewChange("")
    onUrlChange("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const switchMode = (newMode: "url" | "file") => {
    onModeChange(newMode)
    if (newMode === "file") {
      onUrlChange("")
    } else {
      clearImage()
    }
  }

  const handleUrlInput = (url: string) => {
    onUrlChange(url)
    if (url.trim()) {
      onPreviewChange(url)
    } else {
      onPreviewChange("")
    }
  }

  return (
    <div className="h-full flex flex-col">
      <Label>Recipe Image</Label>

      {/* Large Preview Area or Upload Dropzone (Hero Style) */}
      {imagePreview ? (
        <div className="relative flex-1 mt-4">
          <div
            className={clsx(
              "relative overflow-hidden rounded-2xl shadow-xl h-full",
              isDark ? "border border-border" : "border border-white/40"
            )}
          >
            <Image
              src={imagePreview || "/placeholder.svg"}
              alt="Recipe preview"
              fill
              className="object-cover"
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-4 right-4"
            onClick={clearImage}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          className={clsx(
            "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors flex-1 mt-4",
            "flex flex-col items-center justify-center gap-6",
            isDark ? "border-border/50 hover:border-primary" : "border-gray-300 hover:border-primary"
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-base font-medium">Click to upload or drag and drop</p>
              <p className="text-sm text-muted-foreground mt-1">PNG, JPG, WebP, or GIF up to 5MB</p>
            </div>
          </div>

          {/* URL Input inside upload area */}
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex gap-2">
              <Input
                id="image_url"
                value={imageUrl}
                onChange={(e) => handleUrlInput(e.target.value)}
                placeholder="Paste image URL"
                className="text-sm"
                onClick={(e) => e.stopPropagation()}
              />
              <Button
                type="button"
                variant={mode === "url" ? "default" : "outline"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  switchMode("url")
                }}
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {imageFile && (
            <p className="text-sm text-muted-foreground">
              Selected: {imageFile.name} ({(imageFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        id="file-upload"
      />
    </div>
  )
}
