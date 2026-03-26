import { TutorialPath } from "../../lib/types/tutorial"

export const budgetingPath: TutorialPath = {
  id: "budgeting",
  name: "Optimize Resources",
  description: "Move from planning to price comparison with a budget-first workflow.",
  steps: [
    {
      id: 1,
      title: "Budget Snapshot",
      description: "Start with your current activity and quick actions.",
      page: "/dashboard",
      highlightSelector: "[data-tutorial='dashboard-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Your dashboard is the fastest way to see what needs to be planned or purchased next.",
          highlightSelector: "[data-tutorial='dashboard-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use stats to track momentum and avoid unplanned last-minute grocery spending.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Recipe Cost Control",
      description: "Choose recipes that fit your budget targets.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Select recipes with realistic ingredient lists for your budget this week.",
          highlightSelector: "[data-tutorial='recipe-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use filters to quickly narrow options and reduce unnecessary ingredient variety.",
          highlightSelector: "[data-tutorial='recipe-filter']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Budget-Friendly Meal Plan",
      description: "Build a plan that reuses ingredients effectively.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The planner helps you batch decisions and prevent duplicate, wasteful purchases.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use Smart Plan when you want a quick baseline plan to refine for cost.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
        },
      ],
    },
    {
      id: 4,
      title: "Store Comparison",
      description: "Compare totals and select the best store for your list.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The receipt view gives you a consolidated list and total estimate in one place.",
          highlightSelector: "[data-tutorial='store-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Switch stores to compare totals and pick the most cost-effective option.",
          highlightSelector: "[data-tutorial='store-selector']",
          action: "highlight",
        },
      ],
    },
  ],
}
