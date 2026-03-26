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
      highlightSelector: "[data-tutorial='dashboard-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Start here to understand what meals and tasks are upcoming this week.",
          highlightSelector: "[data-tutorial='dashboard-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Your stats help you monitor consistency and keep healthy habits on track.",
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
      highlightSelector: "[data-tutorial='recipe-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Browse recipe options and pick meals that match your energy and nutrition goals.",
          highlightSelector: "[data-tutorial='recipe-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use filters and search to stay aligned with your preferences and restrictions.",
          highlightSelector: "[data-tutorial='recipe-filter']",
          action: "highlight",
        },
      ],
    },
    {
      id: 3,
      title: "Nutrition Planning",
      description: "Build a practical week you can actually follow.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Use the weekly planner to spread meals out and avoid decision fatigue.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Smart planning can speed up prep and keep your weekly nutrition balanced.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
        },
      ],
    },
    {
      id: 4,
      title: "Smart Shopping",
      description: "Choose a store and finalize your health-first list.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Review your full receipt view so you can confirm everything you need is covered.",
          highlightSelector: "[data-tutorial='store-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Compare store options to balance cost, availability, and convenience.",
          highlightSelector: "[data-tutorial='store-selector']",
          action: "highlight",
        },
      ],
    },
  ],
}
