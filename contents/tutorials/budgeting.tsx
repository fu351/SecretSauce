import { TutorialPath } from "../../lib/types/tutorial"

export const budgetingPath: TutorialPath = {
  id: "budgeting",
  name: "Optimize Resources",
  description: "Move from planning to price comparison with a budget-first workflow.",
  steps: [
    {
      id: 1,
      title: "Dashboard Overview",
      description: "Scan the page from top to bottom to see what needs your attention.",
      page: "/dashboard",
      highlightSelector: "[data-tutorial='dashboard-stats']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Start with your stats for a quick snapshot of recipes, favorites, planned meals, and shopping activity.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Graph Tracker shows recent trends so you can see how your activity is moving over time.",
          highlightSelector: "[data-tutorial='dashboard-actions']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Recent Recipes gives you a fast way to jump back into dishes you've been working with lately.",
          highlightSelector: "[data-tutorial='dashboard-recents']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Recipe Cost Control",
      description: "Choose recipes that fit your budget targets.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-filter-cuisine']",
      scrollContainerSelector: "[data-tutorial='recipe-filter-scroll']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Picking a single cuisine limits ingredient overlap across meals — fewer unique items means a smaller, cheaper grocery list.",
          highlightSelector: "[data-tutorial='recipe-filter-cuisine']",
          scrollContainerSelector: "[data-tutorial='recipe-filter-scroll']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Search for a specific ingredient to plan around what you already have at home.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Recipe Detail",
      description: "Assess ingredient count and cost before adding a recipe to your plan.",
      page: "/recipes/*",
      highlightSelector: "[data-tutorial='recipe-detail-pricing']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The pricing breakdown shows what this recipe will cost before it hits your cart.",
          highlightSelector: "[data-tutorial='recipe-detail-pricing']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Scan the ingredient list for overlap with other planned meals — shared items reduce total spend.",
          highlightSelector: "[data-tutorial='recipe-detail-ingredients']",
          action: "highlight",
        },
      ],
    },
    {
      id: 4,
      title: "Budget-Friendly Meal Plan",
      description: "Build a plan that reuses ingredients effectively.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Scan the full week here to find where you can reuse ingredients and reduce duplicate purchases.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Run Smart Plan for a cost baseline, then swap expensive meals for simpler alternatives.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
        },
      ],
    },
    {
      id: 5,
      title: "Store Comparison",
      description: "Compare totals and select the best store for your list.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-total']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Your running total is the key number — if it's over budget, go back and trim the plan.",
          highlightSelector: "[data-tutorial='store-total']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Compare totals across stores before committing — a short detour often saves significantly.",
          highlightSelector: "[data-tutorial='store-selector']",
          action: "highlight",
        },
      ],
    },
    {
      id: 6,
      title: "Home Wrap-Up",
      description: "Take a quick look at Home before returning to your dashboard.",
      page: "/home",
    },
  ],
}
