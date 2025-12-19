import { TutorialPath } from "./types"

export const healthPath: TutorialPath = {
  id: "health",
  name: "Elevate Your Journey",
  description: "Save time and prioritize health",
  steps: [
    {
      id: 1,
      title: "Health at a glance",
      description: "Your dashboard shows upcoming meals and nutrition insights.",
      page: "/dashboard",
      action: "highlight",
      tips: [
        "View your planned meals for the week",
        "Track nutrition trends over time",
        "Update dietary preferences in settings anytime",
      ],
    },
    {
      id: 2,
      title: "Build balanced meal plans",
      description: "Use the highlighted button to add nutritious recipes to your weekly schedule.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-add']",
      action: "highlight",
      tips: [
        "Include protein, vegetables, and whole grains each day",
        "Keep one night flexible for leftovers or eating out",
        "Prep ingredients ahead of time for busy weeknights",
      ],
    },
    {
      id: 3,
      title: "Find healthy recipes",
      description: "Use the filter panel to search by cook time, cuisine, and dietary preferences.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-filter']",
      action: "highlight",
      tips: [
        "Slide the cook time filter to find quick 30-minute meals",
        "Filter by dietary needs like 'High Protein' or 'Low Sodium'",
        "Save your favorite healthy recipes for easy access",
      ],
    },
    {
      id: 4,
      title: "Shop for freshness",
      description: "The shopping list (highlighted) organizes ingredients by store.",
      page: "/shopping",
      highlightSelector: "[data-tutorial='shopping-list']",
      action: "highlight",
      tips: [
        "Pick stores known for quality fresh produce",
        "Check off items as you add them to your cart",
        "Swap processed ingredients for fresh alternatives",
      ],
    },
  ],
}