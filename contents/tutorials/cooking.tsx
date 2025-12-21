import { TutorialPath } from "../../lib/types/tutorial"

export const cookingPath: TutorialPath = {
  id: "cooking",
  name: "Mastering the Craft",
  description: "Learn to cook with confidence and stay organized.",
  steps: [
    {
      id: 1,
      title: "Your Command Center",
      description: "Everything you need to manage your kitchen is right here.",
      page: "/dashboard",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Monitor your cooking frequency and nutritional milestones.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Quickly access recipes you've marked as favorites.",
          highlightSelector: "[data-tutorial='dashboard-actions']",
          action: "highlight",
        }
      ],
      tips: ["Click the logo anytime to return to this view."]
    },
    {
      id: 2,
      title: "The Recipe Library",
      description: "Explore thousands of dishes tailored to your skill level.",
      page: "/recipes",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Search for specific ingredients you have on hand.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Filter by 'Beginner' to find foolproof starting points.",
          highlightSelector: "[data-tutorial='recipe-filter']",
          action: "highlight",
        }
      ]
    },
    {
      id: 3,
      title: "Workflow Organization",
      description: "Use the sidebar to bridge your library and your schedule.",
      page: "/meal-planner",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Open this sidebar to see your available recipes.",
          highlightSelector: "[data-tutorial='planner-sidebar']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Review your week's distribution of meals here.",
          highlightSelector: "[data-tutorial='planner-weekly']",
          action: "highlight",
        }
      ],
      tips: ["Drag recipes from the sidebar directly onto a calendar day."]
    }
  ]
}