"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { SearchFilters } from "@/components/shared/search-filters"

export default function SearchPage() {
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

          <SearchFilters />
        </div>

        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No recipes found</h2>
          <p className="text-gray-600">Try adjusting your search or filters to find what you're looking for.</p>
        </div>
      </div>
    </main>
  )
}
