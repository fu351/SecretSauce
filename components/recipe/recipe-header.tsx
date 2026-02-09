import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"

/**
 * Recipe page header - title/subtext moved to navbar; keeps Upload Recipe button for page context
 */
export function RecipeHeader() {
  return (
    <div className="flex items-center justify-end mb-4">
      <Button asChild>
        <Link href="/upload-recipe">
          <Upload className="h-4 w-4 mr-2" />
          Upload Recipe
        </Link>
      </Button>
    </div>
  )
}
