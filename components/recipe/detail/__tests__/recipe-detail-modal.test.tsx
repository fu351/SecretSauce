import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: (props: any) => <img alt={props.alt} src={props.src} />,
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogTitle: ({ children, className }: any) => <h2 className={className}>{children}</h2>,
}))

vi.mock("@/hooks", () => ({
  useRecipe: () => ({
    data: {
      id: "recipe_1",
      title: "Flour Tortillas",
      servings: 4,
      prep_time: 10,
      cook_time: 20,
      difficulty: "beginner",
      rating_avg: 4.8,
      content: {
        description: "Simple tortillas.",
        image_url: "/image.jpg",
      },
      ingredients: [
        {
          display_name: "2 cups all-purpose flour",
          name: "all-purpose flour",
          amount: "",
          unit: "",
        },
        {
          display_name: "1 tsp salt",
          name: "salt",
          amount: 1,
          unit: "tsp",
        },
      ],
    },
    isLoading: false,
  }),
  useResponsiveImage: () => ({ src: "", width: 0, height: 0 }),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@/lib/image-helper", () => ({
  getRecipeImageUrl: () => "/recipe.jpg",
}))

import { RecipeDetailModal } from "../recipe-detail-modal"

describe("RecipeDetailModal", () => {
  it("renders ingredient quantities the same way as the recipe page", () => {
    render(
      <RecipeDetailModal
        recipeId="recipe_1"
        onClose={vi.fn()}
        onAddToCart={vi.fn()}
      />
    )

    expect(screen.getByText("Ingredients Preview")).toBeInTheDocument()
    expect(screen.getByText("2 cups")).toBeInTheDocument()
    expect(screen.getByText("all-purpose flour")).toBeInTheDocument()
    expect(screen.getByText("1 tsp")).toBeInTheDocument()
    expect(screen.getByText("salt")).toBeInTheDocument()
  })
})
