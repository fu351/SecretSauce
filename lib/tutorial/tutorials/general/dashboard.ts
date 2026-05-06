import type { GeneralPageEntry } from "../../../types/tutorial"

export const dashboardTutorial: GeneralPageEntry = {
  page: "/dashboard",
  title: "Your Command Center",
  description: "Start with the high-level view, then work downward into what deserves attention next.",
  steps: [
    {
      id: 0,
      instruction: "Welcome to Secret Sauce. This quick walkthrough will show you how to find recipes, save them into folders, schedule meals, and turn a plan into a shopping list.",
    },
    {
      id: 1,
      instruction: "Start with your stats for a quick snapshot of recipes, folders, planned meals, and shopping activity.",
      highlightSelector: "[data-tutorial='dashboard-stats']",
    },
    {
      id: 2,
      instruction: "The activity tracker helps you spot trends before you decide what to cook, plan, or improve next.",
      highlightSelector: "[data-tutorial='dashboard-actions']",
    },
    {
      id: 3,
      instruction: "Recent Recipes gives you a fast way to jump back into dishes you have already explored.",
      highlightSelector: "[data-tutorial='dashboard-recents']",
    },
  ],
}
