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
          instruction: "Your activity stats show how consistently you've been cooking and planning week to week.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Recipe Discovery",
      description: "Find the right meal for your goals, schedule, and current skill level.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-filter']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "This sidebar is your main control center for narrowing the recipe list before you start browsing.",
          highlightSelector: "[data-tutorial='recipe-filter']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Search by cuisine, technique, or main ingredient once you have a rough idea of what you want to practice.",
          highlightSelector: "[data-tutorial='recipe-search']",
          scrollContainerSelector: "[data-tutorial='recipe-filter-scroll']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Use difficulty to match recipes to the level you want to train at, whether you're reinforcing basics or pushing into advanced techniques.",
          highlightSelector: "[data-tutorial='recipe-filter-difficulty']",
          scrollContainerSelector: "[data-tutorial='recipe-filter-scroll']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Recipe Detail",
      description: "Check ingredients and instructions before committing to a recipe.",
      page: "/recipes/*",
      highlightSelector: "[data-tutorial='recipe-detail-ingredients']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The ingredient list is everything you need to source — add it to your cart directly from here.",
          highlightSelector: "[data-tutorial='recipe-detail-ingredients']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Scan the step-by-step instructions to gauge technique complexity before committing to the recipe.",
          highlightSelector: "[data-tutorial='recipe-detail-instructions']",
          action: "highlight",
        },
      ],
    },
    {
      id: 4,
      title: "Meal Planning",
      description: "Turn recipe ideas into a practical week.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-smart']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Smart Plan generates a balanced week of meals — a useful starting point to customize from.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "The recipe sidebar lets you search and drag meals directly into your week without leaving the planner.",
          highlightSelector: "[data-tutorial='planner-sidebar']",
          action: "highlight",
        },
      ],
    },
    {
      id: 5,
      title: "Store Checkout Prep",
      description: "Compare totals and finalize your list before checkout.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-selector']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Switch stores to find which one best carries the ingredients your recipes call for.",
          highlightSelector: "[data-tutorial='store-selector']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Review the item breakdown before heading out to catch anything missing or needing adjustment.",
          highlightSelector: "[data-tutorial='store-items']",
          action: "highlight",
        },
      ],
    },
    {
      id: 6,
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
