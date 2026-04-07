import { TutorialPath } from "../../lib/types/tutorial"

export const healthPath: TutorialPath = {
  id: "health",
  name: "Elevate Your Journey",
  description: "Follow a health-focused workflow from dashboard to recipes, planning, and store.",
  steps: [
    {
      id: 1,
      title: "Health Snapshot",
      description: "Check your current momentum at a glance.",
      page: "/dashboard",
      highlightSelector: "[data-tutorial='dashboard-recents']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Your recently planned meals appear here — a quick check to see if your routine is holding.",
          highlightSelector: "[data-tutorial='dashboard-recents']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Track consistency in your stats — small drops here often predict larger habit breaks ahead.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
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
      title: "Update When Your Needs Change",
      description: "Health goals evolve — this is where to reflect that when they do.",
      page: "/settings",
      highlightSelector: "[data-tutorial='settings-preferences']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Update dietary restrictions and cooking time here as your health needs evolve.",
          highlightSelector: "[data-tutorial='settings-preferences']",
          action: "highlight",
          essential: true,
        },
      ],
    },
  ],
}
