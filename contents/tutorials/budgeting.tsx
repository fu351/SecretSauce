import { TutorialPath } from "../../lib/types/tutorial"

export const budgetingPath: TutorialPath = {
  id: "budgeting",
  name: "Optimize Resources",
  description: "Cut grocery costs by comparing local prices and planning ahead.",
  steps: [
    {
      id: 1,
      title: "Strategic Planning",
      description: "Avoid impulse buys by sticking to a predefined AI plan.",
      page: "/meal-planner",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Generate a plan optimized for the lowest local prices.",
          highlightSelector: "[data-tutorial='planner-ai']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Export these recipes to your shopping list immediately.",
          highlightSelector: "[data-tutorial='planner-add']",
          action: "highlight",
        }
      ]
    },
    {
      id: 2,
      title: "The Price War",
      description: "See which local retailers offer the best value for your specific list.",
      page: "/shopping",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Review individual item costs at different stores.",
          highlightSelector: "[data-tutorial='store-list']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Compare the total basket cost for each local store.",
          highlightSelector: "[data-tutorial='store-compare']",
          action: "highlight",
        }
      ],
      tips: ["Sometimes spliting your trip between two stores saves over 20%."]
    }
  ]
}