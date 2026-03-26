import { TutorialPath } from "../../lib/types/tutorial"

export const budgetingPath: TutorialPath = {
  id: "budgeting",
  name: "Optimize Resources",
  description: "Build your shopping list and find the best prices at local stores.",
  steps: [
    {
      id: 1,
      title: "Shopping List",
      description: "Everything you need in one place.",
      page: "/shopping",
      highlightSelector: "[data-tutorial='shopping-list']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Your grocery list auto-populates from planned meals — ingredients are grouped and de-duped.",
          highlightSelector: "[data-tutorial='shopping-list']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Tap Compare Prices to instantly see the total cost across nearby stores.",
          highlightSelector: "[data-tutorial='store-compare']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Store Comparison",
      description: "Pick the store that wins on your specific list.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The receipt view shows a store-by-store price breakdown — switch tabs to compare totals.",
          highlightSelector: "[data-tutorial='store-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Add any extra household items you need directly from this page.",
          highlightSelector: "[data-tutorial='store-add']",
          action: "highlight",
        },
      ],
    },
  ],
}
