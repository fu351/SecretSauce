import { TutorialPath } from "../../lib/types/tutorial"

export const budgetingPath: TutorialPath = {
  id: "budgeting",
  name: "Optimize Resources",
  description: "Advanced tools to track spending and lower your grocery bill.",
  steps: [
    {
      id: 1,
      title: "Financial Tracking",
      description: "Analyze your spending habits.",
      page: "/dashboard",
      highlightSelector: "[data-tutorial='dashboard-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Begin with your dashboard for a high-level budget summary.",
          highlightSelector: "[data-tutorial='dashboard-overview']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Dive into your user stats to see where your money is going.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
          action: "highlight",
        }
      ]
    },
    {
      id: 2,
      title: "Smart Budget Planning",
      description: "Automate your savings via the meal planner.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Start at the planner overview to see your current schedule.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Generate a plan optimized specifically for low local prices.",
          highlightSelector: "[data-tutorial='planner-ai']",
          action: "highlight",
        }
      ]
    },
    {
      id: 3,
      title: "Retail Comparison",
      description: "Pick the best store for your specific list.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Check your shopping list item overview.",
          highlightSelector: "[data-tutorial='store-overview']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Open the menu to manually add extra household essentials.",
          highlightSelector: "[data-tutorial='store-add']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Compare the total cost of your items across different local stores.",
          highlightSelector: "[data-tutorial='store-compare']",
          action: "highlight",
        }
      ]
    }
  ]
}
