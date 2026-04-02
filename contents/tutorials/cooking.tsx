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
      description: "Find the right meal for your goals and schedule.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-search']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Search by cuisine, technique, or main ingredient to find recipes worth developing.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Narrow by cuisine type or prep time once you know the style you want to practice.",
          highlightSelector: "[data-tutorial='recipe-filter']",
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
          instruction: "Nutrition info shows calories and macros per serving — useful when calibrating difficulty vs. payoff.",
          highlightSelector: "[data-tutorial='nutrition-info']",
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
