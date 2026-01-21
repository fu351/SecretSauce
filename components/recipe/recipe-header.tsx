import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"

/**
 * Recipe page header with title and upload button
 */
export function RecipeHeader() {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h1 className="text-4xl font-serif font-light text-foreground mb-2">Recipes</h1>
        <p className="text-xl text-muted-foreground">Discover and share amazing recipes</p>
      </div>
      <div className="flex items-center gap-4">
        <Button asChild>
          <Link href="/upload-recipe">
            <Upload className="h-4 w-4 mr-2" />
            Upload Recipe
          </Link>
        </Button>
      </div>
    </div>
  )
}
