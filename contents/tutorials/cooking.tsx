import { TutorialPath } from "../../lib/types/tutorial"

export const cookingPath: TutorialPath = {
  id: "cooking",
  name: "Mastering the Craft",
  description: "Start at your dashboard, discover recipes, build your plan, then shop.",
  steps: [
    {
      id: 1,
      title: "Kitchen Dashboard",
      description: "Get a quick snapshot before you decide what to cook.",
      page: "/dashboard",
      highlightSelector: "[data-tutorial='dashboard-actions']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Quick action cards let you jump straight into recipes, meal planning, or your shopping list.",
          highlightSelector: "[data-tutorial='dashboard-actions']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Your activity stats show how consistently you've been cooking and planning.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Recipe Discovery",
      description: "Find the right meal for your goals and schedule.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-search']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Search by ingredient, dish name, or cuisine to find recipes that match your skill level.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Filters let you narrow by dietary needs, prep time, or cuisine without scrolling.",
          highlightSelector: "[data-tutorial='recipe-filter']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Meal Planning",
      description: "Turn recipe ideas into a practical week.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-smart']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Smart Plan generates a balanced week of meals — a good starting point to adjust from.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Drag meals into days on the weekly grid to build your week manually.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
        },
      ],
    },
    {
      id: 4,
      title: "Store Checkout Prep",
      description: "Compare totals and finalize your list before checkout.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-selector']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Switch stores here to compare totals and choose the best option before you shop.",
          highlightSelector: "[data-tutorial='store-selector']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Your estimated total updates live as your plan changes.",
          highlightSelector: "[data-tutorial='store-total']",
          action: "highlight",
        },
      ],
    },
    {
      id: 5,
      title: "Keep Your Preferences Current",
      description: "As your skills grow, update your level and cuisines here to keep recipes challenging.",
      page: "/settings",
      highlightSelector: "[data-tutorial='settings-preferences']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Revisit these whenever your skill level or goals change — they shape every recipe recommendation.",
          highlightSelector: "[data-tutorial='settings-preferences']",
          action: "highlight",
          essential: true,
        },
      ],
    },
  ],
}
