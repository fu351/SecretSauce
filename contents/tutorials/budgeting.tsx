import { TutorialPath } from "../../lib/types/tutorial"

export const budgetingPath: TutorialPath = {
  id: "budgeting",
  name: "Optimize Resources",
  description: "Move from planning to price comparison with a budget-first workflow.",
  steps: [
    {
      id: 1,
      title: "Budget Snapshot",
      description: "Track activity and spot unplanned spending before it happens.",
      page: "/dashboard",
      highlightSelector: "[data-tutorial='dashboard-stats']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Your stats show spending momentum — use them to catch patterns before they become habits.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Jump directly to planning or shopping from here to stay on track.",
          highlightSelector: "[data-tutorial='dashboard-actions']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Recipe Cost Control",
      description: "Choose recipes that fit your budget targets.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-filter']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Filter recipes to narrow the ingredient list and reduce what ends up on your shopping list.",
          highlightSelector: "[data-tutorial='recipe-filter']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Search for simpler recipes when you want to minimize ingredient count and cost.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Budget-Friendly Meal Plan",
      description: "Build a plan that reuses ingredients effectively.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-smart']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Smart Plan gives you a cost-aware baseline — refine it to reuse ingredients across meals.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Review the full week on the grid to spot overlapping ingredients and batch purchases.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
        },
      ],
    },
    {
      id: 4,
      title: "Store Comparison",
      description: "Compare totals and select the best store for your list.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-selector']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Compare store totals before you commit — small differences add up over time.",
          highlightSelector: "[data-tutorial='store-selector']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Your running total updates as you check off items during the shop.",
          highlightSelector: "[data-tutorial='store-total']",
          action: "highlight",
        },
      ],
    },
    {
      id: 5,
      title: "Adjust as Your Budget Changes",
      description: "When spending targets shift, this is where to update them.",
      page: "/settings",
      highlightSelector: "[data-tutorial='settings-preferences']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Come back here if your budget range shifts — narrowing preferences also reduces ingredient variety.",
          highlightSelector: "[data-tutorial='settings-preferences']",
          action: "highlight",
          essential: true,
        },
      ],
    },
  ],
}
