"use client"

import { useState, useEffect } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { SearchFilters } from "@/components/shared/search-filters"
import { supabase } from "@/lib/supabase"

export default function SearchPage() {
  const [cuisines, setCuisines] = useState<string[]>([])
  const [loadingCuisines, setLoadingCuisines] = useState(true)

  useEffect(() => {
    const fetchCuisines = async () => {
      try {
        const { data: recipesData, error: recipesError } = await supabase
          .from("recipes")
          .select("cuisine_id")
          .not("cuisine_id", "is", null)

        if (recipesError) {
          console.error("Error fetching recipe cuisines:", recipesError)
          setLoadingCuisines(false)
          return
        }

        // Now fetch cuisines table to get names
        const cuisineIds = recipesData?.map((r: any) => r.cuisine_id).filter(Boolean) || []
        if (cuisineIds.length === 0) {
          setLoadingCuisines(false)
          return
        }

        const { data: cuisinesData, error: cuisinesError } = await supabase
          .from("cuisines")
          .select("id, name")
          .in("id", cuisineIds)

        if (cuisinesError) {
          console.error("Error fetching cuisines:", cuisinesError)
          setLoadingCuisines(false)
          return
        }

        // Extract unique cuisine names from cuisines table
        const uniqueCuisines = cuisinesData?.map((c: any) => c.name).sort() || []

        setCuisines(uniqueCuisines)
      } catch (error) {
        console.error("Error fetching cuisines:", error)
      } finally {
        setLoadingCuisines(false)
      }
    }

    fetchCuisines()
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">Find Your Perfect Recipe</h1>

          <div className="relative max-w-2xl mx-auto mb-8">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              placeholder="Search recipes by name, ingredient, or cuisine..."
              className="pl-12 py-4 text-lg rounded-full border-gray-200 shadow-sm"
            />
          </div>

          {!loadingCuisines && <SearchFilters availableCuisines={cuisines} />}
        </div>

        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No recipes found</h2>
          <p className="text-gray-600">Try adjusting your search or filters to find what you're looking for.</p>
        </div>
      </div>
    </main>
  )
}
