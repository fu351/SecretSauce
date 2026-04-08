import { TutorialPath } from "../../lib/types/tutorial"

export const healthPath: TutorialPath = {
  id: "health",
  name: "Elevate Your Journey",
  description: "Follow a health-focused workflow from dashboard to recipes, planning, and store.",
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
      title: "Healthy Recipe Selection",
      description: "Find meals that align with your dietary goals.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-filter-dietary']",
      scrollContainerSelector: "[data-tutorial='recipe-filter-scroll']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Set your dietary tags here to cut out anything that doesn't fit your restrictions before exploring.",
          highlightSelector: "[data-tutorial='recipe-filter-dietary']",
          scrollContainerSelector: "[data-tutorial='recipe-filter-scroll']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Search for specific ingredients you're trying to eat more of, or dishes targeting your macros.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Recipe Detail",
      description: "Check the nutrition breakdown before adding a recipe to your week.",
      page: "/recipes/*",
      highlightSelector: "[data-tutorial='nutrition-info']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The nutrition panel shows calories, protein, and fat per serving — decide here if it fits your targets.",
          highlightSelector: "[data-tutorial='nutrition-info']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Check the dietary tags to confirm the recipe fits your restrictions before adding it to your plan.",
          highlightSelector: "[data-tutorial='recipe-detail-tags']",
          action: "highlight",
        },
      ],
    },
    {
      id: 4,
      title: "Nutrition Planning",
      description: "Build a practical week you can actually follow.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-macros']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "The macro summary shows whether your week's meals are hitting your nutrition targets.",
          highlightSelector: "[data-tutorial='planner-macros']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Run Smart Plan first to distribute meals across the week, then adjust for nutritional balance.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
        },
      ],
    },
    {
      id: 5,
      title: "Smart Shopping",
      description: "Choose a store and finalize your health-first list.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-missing']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Missing items lead to on-the-fly substitutes — which are rarely the healthier option.",
          highlightSelector: "[data-tutorial='store-missing']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Choose a store where the health-focused ingredients your plan calls for are reliably in stock.",
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
