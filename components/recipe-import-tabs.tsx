"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, Link2, ImageIcon, Instagram } from "lucide-react"
import { RecipeImportUrl } from "./recipe-import-url"
import { RecipeImportImage } from "./recipe-import-image"
import { RecipeImportInstagram } from "./recipe-import-instagram"
import type { ImportedRecipe } from "@/lib/types/recipe-imports"

interface RecipeImportTabsProps {
  onImportSuccess: (recipe: ImportedRecipe) => void
}

export function RecipeImportTabs({ onImportSuccess }: RecipeImportTabsProps) {
  const [activeTab, setActiveTab] = useState("url")
  const [importError, setImportError] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from URL or Image</CardTitle>
        <CardDescription>
          Automatically extract recipe details from websites, Instagram, or photos
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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

          <TabsContent value="url" className="space-y-4 mt-4">
            <RecipeImportUrl
              onImportSuccess={(recipe) => {
                setImportError(null)
                onImportSuccess(recipe)
              }}
            />
          </TabsContent>

          <TabsContent value="image" className="space-y-4 mt-4">
            <RecipeImportImage
              onImportSuccess={(recipe) => {
                setImportError(null)
                onImportSuccess(recipe)
              }}
            />
          </TabsContent>

          <TabsContent value="instagram" className="space-y-4 mt-4">
            <RecipeImportInstagram
              onImportSuccess={(recipe) => {
                setImportError(null)
                onImportSuccess(recipe)
              }}
            />
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
  )
}
