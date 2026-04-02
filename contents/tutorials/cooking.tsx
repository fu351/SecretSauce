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
      highlightSelector: "[data-tutorial='dashboard-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "This is your command center for what to cook next and what needs attention.",
          highlightSelector: "[data-tutorial='dashboard-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use quick action cards to jump straight into recipes, planning, or shopping.",
          highlightSelector: "[data-tutorial='dashboard-actions']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Recipe Discovery",
      description: "Find the right meal for your goals and schedule.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Browse the recipe library to find ideas and save what you want to make.",
          highlightSelector: "[data-tutorial='recipe-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use search and filters to narrow recipes by ingredients, cuisine, or dietary needs.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Meal Planning",
      description: "Turn recipe ideas into a practical week.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The weekly planner helps you lay out meals so prep is predictable.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use Smart Plan to quickly generate a balanced week when you want a head start.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
        },
      ],
    },
    {
      id: 4,
      title: "Store Checkout Prep",
      description: "Compare totals and finalize your list before checkout.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Your store receipt view centralizes your full list and live pricing state.",
          highlightSelector: "[data-tutorial='store-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Switch stores to compare totals and choose the best option for this run.",
          highlightSelector: "[data-tutorial='store-selector']",
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
