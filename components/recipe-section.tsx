"use client"

import { RecipeCard } from "./recipe-card"
import Link from "next/link"

interface Recipe {
  id: string
  title: string
  image: string
  rating: number
  difficulty: "Beginner" | "Intermediate" | "Advanced"
  comments: number
  tags: string[]
  issues?: number
}

interface RecipeSectionProps {
  title: string
  recipes: Recipe[]
  showViewAll?: boolean
}

export function RecipeSection({ title, recipes, showViewAll = true }: RecipeSectionProps) {
  return (
    <section className="py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold text-gray-900">{title}</h2>
          {showViewAll && <button className="text-blue-500 hover:text-blue-600 font-medium">View all</button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipes.map((recipe) => (
            <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
              <RecipeCard {...recipe} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
