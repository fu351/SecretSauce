import { TutorialPath } from "../../lib/types/tutorial"

export const healthPath: TutorialPath = {
  id: "health",
  name: "Elevate Your Journey",
  description: "Prioritize your well-wellbeing with precise data and planning.",
  steps: [
    {
      id: 1,
      title: "Dietary Personalization",
      description: "Ensure every suggestion fits your lifestyle.",
      page: "/settings",
      highlightSelector: "[data-tutorial='settings-preferences']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Set your global preferences for meal restrictions and allergens.",
          highlightSelector: "[data-tutorial='settings-preferences']",
          action: "highlight",
        }
      ]
    },
    {
      id: 2,
      title: "Nutritional Planning",
      description: "Hit your targets with AI assistance and macro tracking.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Open the planner overview to see your weekly structure.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Let the AI recommend a week of meals based on your health goals.",
          highlightSelector: "[data-tutorial='planner-smart']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Monitor the macros bar to see your calorie and nutrient distribution.",
          highlightSelector: "[data-tutorial='planner-macros']",
          action: "highlight",
        }
      ]
    },
    {
      id: 3,
      title: "Organized Nutrition",
      description: "Keep your grocery list as healthy as your plan.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Review your full list to ensure all staples are present.",
          highlightSelector: "[data-tutorial='store-overview']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Switch stores to review availability and nutrition-friendly options before checkout.",
          highlightSelector: "[data-tutorial='store-selector']",
          action: "highlight",
        }
      ]
    }
  ]
}
