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
      highlightSelector: "[data-tutorial='dashboard-stats']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Your stats track consistency — steady momentum matters more than perfection.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use quick actions to stay in your routine without hunting through menus.",
          highlightSelector: "[data-tutorial='dashboard-actions']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Healthy Recipe Selection",
      description: "Find meals that align with your dietary goals.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-filter']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Filters let you stay within your dietary restrictions without scrolling through irrelevant options.",
          highlightSelector: "[data-tutorial='recipe-filter']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Search by ingredient or dish type to find meals aligned with your nutrition goals.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Nutrition Planning",
      description: "Build a practical week you can actually follow.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-smart']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Smart Plan distributes meals evenly across the week so nutrition stays balanced.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Check the macro summary here to see if your week's nutrition is on track.",
          highlightSelector: "[data-tutorial='planner-macros']",
          action: "highlight",
        },
      ],
    },
    {
      id: 4,
      title: "Smart Shopping",
      description: "Choose a store and finalize your health-first list.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-selector']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Choose a store that has the health-focused ingredients your plan calls for.",
          highlightSelector: "[data-tutorial='store-selector']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Confirm your full list before heading out — nothing missing means no unplanned substitutes.",
          highlightSelector: "[data-tutorial='store-total']",
          action: "highlight",
        },
      ],
    },
    {
      id: 5,
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
