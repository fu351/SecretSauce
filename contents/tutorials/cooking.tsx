import { TutorialPath } from "../../lib/types/tutorial"

export const cookingPath: TutorialPath = {
  id: "cooking",
  name: "Mastering the Craft",
  description: "Recipe discovery, meal planning, and your culinary command center.",
  steps: [
    {
      id: 1,
      title: "Recipe Discovery",
      description: "Find the perfect meal for any occasion.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Browse the recipe library — featured collections and community picks are at the top.",
          highlightSelector: "[data-tutorial='recipe-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use the sidebar to search by name or ingredient and filter by cuisine, diet, or difficulty.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Weekly Meal Planner",
      description: "Lay out your whole week in one view.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The weekly grid shows every meal slot at a glance — tap any cell to fill it.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Open the recipe sidebar to browse, search, and drag meals directly into your plan.",
          highlightSelector: "[data-tutorial='planner-sidebar']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Use the toolbar to auto-generate a smart week, jump to today, or push your list to shopping.",
          highlightSelector: "[data-tutorial='planner-actions']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Command Center",
      description: "Your daily kitchen snapshot.",
      page: "/dashboard",
      highlightSelector: "[data-tutorial='dashboard-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The dashboard gives you a live summary of today's meals and upcoming activity.",
          highlightSelector: "[data-tutorial='dashboard-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Jump back into recently viewed or cooked recipes from the Recents panel.",
          highlightSelector: "[data-tutorial='dashboard-recents']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Quick-access cards get you to any feature in the app in a single tap.",
          highlightSelector: "[data-tutorial='dashboard-actions']",
          action: "highlight",
        },
      ],
    },
  ],
}
