import { TutorialPath } from "../../lib/types/tutorial"

export const healthPath: TutorialPath = {
  id: "health",
  name: "Elevate Your Journey",
  description: "Prioritize your well-being with data-driven planning.",
  steps: [
    {
      id: 1,
      title: "Personalized Settings",
      description: "Input your dietary needs to filter out allergens and unwanted ingredients.",
      page: "/settings",
      highlightSelector: "[data-tutorial='settings-preferences']",
      action: "highlight",
      tips: ["Setting preferences here updates all recipe suggestions app-wide."]
    },
    {
      id: 2,
      title: "Nutritional Snapshot",
      description: "See exactly what you're consuming throughout the week.",
      page: "/meal-planner",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Check your average daily calories and macro distribution.",
          highlightSelector: "[data-tutorial='planner-weekly']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Let AI generate a balanced plan based on your health goals.",
          highlightSelector: "[data-tutorial='planner-ai']",
          action: "highlight",
        }
      ]
    },
    {
      id: 3,
      title: "Healthy Staples",
      description: "Move your healthy plan into the real world.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-add']",
      action: "highlight",
      tips: ["Consolidate your ingredients to ensure you never miss a nutrient."]
    }
  ]
}