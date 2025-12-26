"use client"

import type React from "react"
import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { uploadRecipeImage } from "@/lib/image-helper"
import { performOCR } from "@/lib/ocr-service"
import { tagRecipeFromIngredients } from "@/lib/recipe-tagging"
import { Plus, X, Upload, LinkIcon, Link2, Image as ImageIcon, Instagram, Loader2, AlertCircle, PenLine, Download } from "lucide-react"
import Image from "next/image"
import type { ImportedRecipe, RecipeImportResponse } from "@/lib/types/recipe"

const DIETARY_TAGS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "keto", "paleo", "low-carb"]
const CUISINE_TYPES = [
  "italian", "mexican", "chinese", "indian", "american", "french",
  "japanese", "thai", "mediterranean", "korean", "greek", "spanish", "other"
]

interface Ingredient {
  name: string
  amount: string
  unit: string
  standardizedIngredientId?: string
  standardizedName?: string
}

interface Instruction {
  step: number
  description: string
}

export default function UploadRecipePage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ocrFileInputRef = useRef<HTMLInputElement>(null)

  // Main tab state
  const [mainTab, setMainTab] = useState<"manual" | "import">("manual")

  // Import sub-tab state
  const [importTab, setImportTab] = useState("url")
  const [importing, setImporting] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)

  // URL import state
  const [recipeUrl, setRecipeUrl] = useState("")

  // Instagram import state
  const [instagramUrl, setInstagramUrl] = useState("")

  // OCR image import state
  const [ocrImageFile, setOcrImageFile] = useState<File | null>(null)
  const [ocrImagePreview, setOcrImagePreview] = useState<string>("")

  // Form state
  const [loading, setLoading] = useState(false)
  const [imageMode, setImageMode] = useState<"url" | "file">("url")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>("")

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    image_url: "",
    prep_time: "",
    cook_time: "",
    servings: "",
    difficulty: "beginner",
    cuisine: "",
    dietary_tags: [] as string[],
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  })

  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: "", amount: "", unit: "" }])
  const [instructions, setInstructions] = useState<Instruction[]>([{ step: 1, description: "" }])

  // Helper to populate form from imported recipe
  const populateFormFromRecipe = (recipe: ImportedRecipe) => {
    setFormData({
      title: recipe.title || "",
      description: recipe.description || "",
      image_url: recipe.image_url || "",
      prep_time: recipe.prep_time?.toString() || "",
      cook_time: recipe.cook_time?.toString() || "",
      servings: recipe.servings?.toString() || "",
      difficulty: "beginner",
      cuisine: recipe.cuisine || "",
      dietary_tags: recipe.dietary_tags || [],
      calories: recipe.nutrition?.calories?.toString() || "",
      protein: recipe.nutrition?.protein?.toString() || "",
      carbs: recipe.nutrition?.carbs?.toString() || "",
      fat: recipe.nutrition?.fat?.toString() || "",
    })

    if (recipe.image_url) {
      setImagePreview(recipe.image_url)
      setImageMode("url")
    }

    if (recipe.ingredients.length > 0) {
      setIngredients(recipe.ingredients)
    } else {
      setIngredients([{ name: "", amount: "", unit: "" }])
    }

    if (recipe.instructions.length > 0) {
      setInstructions(recipe.instructions)
    } else {
      setInstructions([{ step: 1, description: "" }])
    }

    // Switch to manual tab to show/edit the form
    setMainTab("manual")
  }

  // Import from URL
  const handleUrlImport = async () => {
    if (!recipeUrl) {
      setImportError("Please enter a recipe URL")
      return
    }

    setImporting(true)
    setImportError(null)

    try {
      const response = await fetch("/api/recipe-import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: recipeUrl }),
      })

      const data: RecipeImportResponse = await response.json()

      if (!data.success || !data.recipe) {
        throw new Error(data.error || "Failed to import recipe")
      }

      populateFormFromRecipe(data.recipe)

      toast({
        title: "Recipe imported",
        description: "Review the details below and save when ready.",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import recipe"
      setImportError(message)
      toast({
        title: "Import failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setImporting(false)
    }
  }

  // Import from Instagram
  const handleInstagramImport = async () => {
    if (!instagramUrl) {
      setImportError("Please enter an Instagram URL")
      return
    }

    setImporting(true)
    setImportError(null)

    try {
      const response = await fetch("/api/recipe-import/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: instagramUrl }),
      })

      const data: RecipeImportResponse = await response.json()

      if (!data.success || !data.recipe) {
        throw new Error(data.error || "Failed to import from Instagram")
      }

      populateFormFromRecipe(data.recipe)

      toast({
        title: "Recipe imported from Instagram",
        description: "Review the details below and save when ready.",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import from Instagram"
      setImportError(message)
      toast({
        title: "Import failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setImporting(false)
    }
  }

  // Handle OCR image file selection
  const handleOcrImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setOcrImageFile(file)
      setOcrImagePreview(URL.createObjectURL(file))
      setImportError(null)
    }
  }

  // Import from image using OCR
  const handleImageImport = async () => {
    if (!ocrImageFile) {
      setImportError("Please select an image")
      return
    }

    setImporting(true)
    setImportError(null)
    setOcrProgress(0)

    try {
      // Perform OCR
      const ocrResult = await performOCR(ocrImageFile, setOcrProgress)

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

      populateFormFromRecipe(data.recipe)

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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import from image"
      setImportError(message)
      toast({
        title: "Import failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setImporting(false)
      setOcrProgress(0)
    }
  }

  // Standardize ingredients after save
  const standardizeRecipeIngredients = async (recipeId: string, recipeIngredients: Ingredient[]) => {
    try {
      const response = await fetch("/api/ingredients/standardize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "recipe",
          recipeId,
          ingredients: recipeIngredients.map((ingredient, index) => ({
            ...ingredient,
            id: index,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to standardize ingredients")
      }

      const payload = await response.json()
      if (payload?.standardized?.length) {
        toast({
          title: "Ingredients standardized",
          description: "Recipe ingredients were mapped to canonical grocery items.",
        })
      }
    } catch (error) {
      console.error("Ingredient standardization failed:", error)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))

    if (field === "image_url" && value) {
      setImagePreview(value)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file.",
          variant: "destructive",
        })
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive",
        })
        return
      }

      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview("")
    setFormData((prev) => ({ ...prev, image_url: "" }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const addIngredient = () => {
    setIngredients([...ingredients, { name: "", amount: "", unit: "" }])
  }

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], [field]: value }
    setIngredients(updated)
  }

  const addInstruction = () => {
    setInstructions([...instructions, { step: instructions.length + 1, description: "" }])
  }

  const removeInstruction = (index: number) => {
    const updated = instructions.filter((_, i) => i !== index)
    setInstructions(updated.map((inst, i) => ({ ...inst, step: i + 1 })))
  }

  const updateInstruction = (index: number, value: string) => {
    const updated = [...instructions]
    updated[index] = { ...updated[index], description: value }
    setInstructions(updated)
  }

  const toggleDietaryTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(tag)
        ? prev.dietary_tags.filter((t) => t !== tag)
        : [...prev.dietary_tags, tag],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to upload recipes.",
        variant: "destructive",
      })
      return
    }

    if (!formData.title.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a recipe title.",
        variant: "destructive",
      })
      return
    }

    const validIngredients = ingredients.filter((ing) => ing.name.trim())
    if (validIngredients.length === 0) {
      toast({
        title: "Missing information",
        description: "Please add at least one ingredient.",
        variant: "destructive",
      })
      return
    }

    const validInstructions = instructions.filter((inst) => inst.description.trim())
    if (validInstructions.length === 0) {
      toast({
        title: "Missing information",
        description: "Please add at least one instruction step.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      let imageValue = formData.image_url || null

      if (imageFile && imageMode === "file") {
        try {
          const storagePath = await uploadRecipeImage(imageFile, user.id)
          imageValue = storagePath
        } catch (error: any) {
          console.error("Error uploading image:", error)
          toast({
            title: "Image upload failed",
            description: error.message || "Failed to upload image. Continuing without image.",
            variant: "destructive",
          })
          imageValue = null
        }
      }

      // Auto-generate dietary flags, protein tag, cuisine guess, and meal type from ingredients and title
      const autoTags = tagRecipeFromIngredients(validIngredients, formData.title)

      const recipeData = {
        title: formData.title,
        description: formData.description,
        image_url: imageValue,
        prep_time: Number.parseInt(formData.prep_time) || 0,
        cook_time: Number.parseInt(formData.cook_time) || 0,
        servings: Number.parseInt(formData.servings) || 1,
        difficulty: formData.difficulty,
        cuisine: formData.cuisine || null,
        dietary_tags: formData.dietary_tags,
        ingredients: validIngredients,
        instructions: validInstructions.map((inst, i) => ({ step: i + 1, description: inst.description })),
        nutrition: {
          calories: Number.parseInt(formData.calories) || 0,
          protein: Number.parseInt(formData.protein) || 0,
          carbs: Number.parseInt(formData.carbs) || 0,
          fat: Number.parseInt(formData.fat) || 0,
        },
        author_id: user.id,
        // Auto-generated tags for AI planner
        dietary_flags: autoTags.dietary_flags,
        protein_tag: autoTags.protein_tag,
        cuisine_guess: autoTags.cuisine_guess,
        meal_type_guess: autoTags.meal_type_guess,
      }

      const { data, error } = await supabase.from("recipes").insert(recipeData).select()

      if (error) throw error

      if (!data || data.length === 0) {
        throw new Error("No data returned from insert")
      }

      await standardizeRecipeIngredients(data[0].id, recipeData.ingredients)

      toast({
        title: "Recipe uploaded!",
        description: "Your recipe has been successfully uploaded.",
      })

      router.push(`/recipes/${data[0].id}`)
    } catch (error: any) {
      console.error("Error uploading recipe:", error)
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload recipe. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Add Recipe</h1>
          <p className="text-muted-foreground">Create a new recipe manually or import from a URL</p>
        </div>

        {/* Main Tabs - Manual vs Import */}
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "manual" | "import")} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Manual Entry
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Import Recipe
            </TabsTrigger>
          </TabsList>

          {/* Import Tab Content */}
          <TabsContent value="import" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Import from URL or Image</CardTitle>
                <CardDescription>
                  Automatically extract recipe details from websites, Instagram, or photos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={importTab} onValueChange={setImportTab}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="url" className="flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      URL
                    </TabsTrigger>
                    <TabsTrigger value="image" className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Image
                    </TabsTrigger>
                    <TabsTrigger value="instagram" className="flex items-center gap-2">
                      <Instagram className="h-4 w-4" />
                      Instagram
                    </TabsTrigger>
                  </TabsList>

                  {/* URL Import */}
                  <TabsContent value="url" className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="recipe-url">Recipe URL</Label>
                      <Input
                        id="recipe-url"
                        placeholder="https://www.allrecipes.com/recipe/..."
                        value={recipeUrl}
                        onChange={(e) => setRecipeUrl(e.target.value)}
                        disabled={importing}
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Supports 400+ recipe websites including AllRecipes, Food Network, and more
                      </p>
                    </div>
                    <Button onClick={handleUrlImport} disabled={importing || !recipeUrl}>
                      {importing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        "Import from URL"
                      )}
                    </Button>
                  </TabsContent>

                  {/* Image Import */}
                  <TabsContent value="image" className="space-y-4 mt-4">
                    <div>
                      <Label>Recipe Image</Label>
                      <div
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                        onClick={() => ocrFileInputRef.current?.click()}
                      >
                        {ocrImagePreview ? (
                          <div className="relative">
                            <Image
                              src={ocrImagePreview}
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
                                setOcrImageFile(null)
                                setOcrImagePreview("")
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                            <p>Click to upload or drag and drop</p>
                            <p className="text-sm text-muted-foreground">
                              PNG, JPG up to 10MB
                            </p>
                          </>
                        )}
                      </div>
                      <input
                        ref={ocrFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleOcrImageSelect}
                        disabled={importing}
                      />
                    </div>
                    {importing && ocrProgress > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm">Processing image... {ocrProgress}%</p>
                        <Progress value={ocrProgress} />
                      </div>
                    )}
                    <Button onClick={handleImageImport} disabled={importing || !ocrImageFile}>
                      {importing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        "Extract Recipe from Image"
                      )}
                    </Button>
                  </TabsContent>

                  {/* Instagram Import */}
                  <TabsContent value="instagram" className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="instagram-url">Instagram Post URL</Label>
                      <Input
                        id="instagram-url"
                        placeholder="https://www.instagram.com/p/..."
                        value={instagramUrl}
                        onChange={(e) => setInstagramUrl(e.target.value)}
                        disabled={importing}
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Paste a link to an Instagram post, reel, or video with a recipe in the caption
                      </p>
                    </div>
                    <Button onClick={handleInstagramImport} disabled={importing || !instagramUrl}>
                      {importing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        "Import from Instagram"
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>

                {importError && (
                  <div className="mt-4 p-4 bg-destructive/10 border border-destructive rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{importError}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manual Entry Tab Content */}
          <TabsContent value="manual" className="mt-6">
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="title">Recipe Title *</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => handleInputChange("title", e.target.value)}
                        placeholder="e.g., Classic Spaghetti Carbonara"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleInputChange("description", e.target.value)}
                        placeholder="Describe your recipe..."
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label>Recipe Image</Label>
                      <div className="flex gap-2 mt-2 mb-3">
                        <Button
                          type="button"
                          variant={imageMode === "url" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setImageMode("url")
                            clearImage()
                          }}
                        >
                          <LinkIcon className="h-4 w-4 mr-2" />
                          Image URL
                        </Button>
                        <Button
                          type="button"
                          variant={imageMode === "file" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setImageMode("file")
                            setFormData((prev) => ({ ...prev, image_url: "" }))
                          }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload File
                        </Button>
                      </div>

                      {imageMode === "url" ? (
                        <Input
                          id="image_url"
                          value={formData.image_url}
                          onChange={(e) => handleInputChange("image_url", e.target.value)}
                          placeholder="https://example.com/image.jpg"
                        />
                      ) : (
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="file-upload"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full bg-transparent"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {imageFile ? imageFile.name : "Choose an image file"}
                          </Button>
                          {imageFile && (
                            <p className="text-sm text-muted-foreground mt-2">{(imageFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          )}
                        </div>
                      )}

                      {imagePreview && (
                        <div className="mt-3 relative">
                          <div className="relative w-full h-48 rounded-lg overflow-hidden bg-muted">
                            <Image
                              src={imagePreview || "/placeholder.svg"}
                              alt="Recipe preview"
                              fill
                              className="object-cover"
                            />
                          </div>
                          <Button type="button" variant="destructive" size="sm" className="mt-2" onClick={clearImage}>
                            <X className="h-4 w-4 mr-2" />
                            Remove Image
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label htmlFor="prep_time">Prep Time (min)</Label>
                        <Input
                          id="prep_time"
                          type="number"
                          value={formData.prep_time}
                          onChange={(e) => handleInputChange("prep_time", e.target.value)}
                          placeholder="15"
                        />
                      </div>

                      <div>
                        <Label htmlFor="cook_time">Cook Time (min)</Label>
                        <Input
                          id="cook_time"
                          type="number"
                          value={formData.cook_time}
                          onChange={(e) => handleInputChange("cook_time", e.target.value)}
                          placeholder="30"
                        />
                      </div>

                      <div>
                        <Label htmlFor="servings">Servings</Label>
                        <Input
                          id="servings"
                          type="number"
                          value={formData.servings}
                          onChange={(e) => handleInputChange("servings", e.target.value)}
                          placeholder="4"
                        />
                      </div>

                      <div>
                        <Label htmlFor="difficulty">Difficulty</Label>
                        <Select
                          value={formData.difficulty}
                          onValueChange={(value) => handleInputChange("difficulty", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="cuisine">Cuisine Type</Label>
                      <Select value={formData.cuisine} onValueChange={(value) => handleInputChange("cuisine", value)}>
                        <SelectTrigger id="cuisine">
                          <SelectValue placeholder="Select cuisine type" />
                        </SelectTrigger>
                        <SelectContent>
                          {CUISINE_TYPES.map((cuisine) => (
                            <SelectItem key={cuisine} value={cuisine}>
                              {cuisine.charAt(0).toUpperCase() + cuisine.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Dietary Tags</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {DIETARY_TAGS.map((tag) => (
                          <Badge
                            key={tag}
                            variant={formData.dietary_tags.includes(tag) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleDietaryTag(tag)}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Ingredients */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Ingredients</CardTitle>
                      <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Ingredient
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {ingredients.map((ingredient, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder="Amount"
                          value={ingredient.amount}
                          onChange={(e) => updateIngredient(index, "amount", e.target.value)}
                          className="w-20"
                        />
                        <Input
                          placeholder="Unit"
                          value={ingredient.unit}
                          onChange={(e) => updateIngredient(index, "unit", e.target.value)}
                          className="w-24"
                        />
                        <Input
                          placeholder="Ingredient name"
                          value={ingredient.name}
                          onChange={(e) => updateIngredient(index, "name", e.target.value)}
                          className="flex-1"
                        />
                        {ingredients.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeIngredient(index)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Instructions */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Instructions</CardTitle>
                      <Button type="button" variant="outline" size="sm" onClick={addInstruction}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Step
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {instructions.map((instruction, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#d4af37] text-black flex items-center justify-center flex-shrink-0 mt-1">
                          {instruction.step}
                        </div>
                        <Textarea
                          placeholder="Describe this step..."
                          value={instruction.description}
                          onChange={(e) => updateInstruction(index, e.target.value)}
                          rows={2}
                          className="flex-1"
                        />
                        {instructions.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeInstruction(index)}
                            className="mt-1"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Nutrition (Optional) */}
                <Card>
                  <CardHeader>
                    <CardTitle>Nutrition Information (Optional)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label htmlFor="calories">Calories</Label>
                        <Input
                          id="calories"
                          type="number"
                          value={formData.calories}
                          onChange={(e) => handleInputChange("calories", e.target.value)}
                          placeholder="250"
                        />
                      </div>

                      <div>
                        <Label htmlFor="protein">Protein (g)</Label>
                        <Input
                          id="protein"
                          type="number"
                          value={formData.protein}
                          onChange={(e) => handleInputChange("protein", e.target.value)}
                          placeholder="15"
                        />
                      </div>

                      <div>
                        <Label htmlFor="carbs">Carbs (g)</Label>
                        <Input
                          id="carbs"
                          type="number"
                          value={formData.carbs}
                          onChange={(e) => handleInputChange("carbs", e.target.value)}
                          placeholder="30"
                        />
                      </div>

                      <div>
                        <Label htmlFor="fat">Fat (g)</Label>
                        <Input
                          id="fat"
                          type="number"
                          value={formData.fat}
                          onChange={(e) => handleInputChange("fat", e.target.value)}
                          placeholder="10"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Submit Button */}
                <div className="flex gap-4">
                  <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? "Uploading..." : "Save Recipe"}
                  </Button>
                </div>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
