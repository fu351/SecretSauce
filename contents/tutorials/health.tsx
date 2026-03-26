import { TutorialPath } from "../../lib/types/tutorial"

export const healthPath: TutorialPath = {
  id: "health",
  name: "Elevate Your Journey",
  description: "Personalize your diet and track what's already in your kitchen.",
  steps: [
    {
      id: 1,
      title: "Dietary Preferences",
      description: "Every suggestion, filtered to fit your lifestyle.",
      page: "/settings",
      highlightSelector: "[data-tutorial='settings-preferences']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Set your dietary restrictions and allergens here — they apply automatically to recipes and meal plans.",
          highlightSelector: "[data-tutorial='settings-preferences']",
          action: "highlight",
          essential: true,
        },
      ],
    },
    {
      id: 2,
      title: "Pantry Inventory",
      description: "Know what you have, reduce what you waste.",
      page: "/pantry",
      highlightSelector: "[data-tutorial='pantry-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Track your ingredients here — the app uses your pantry to suggest meals you can make right now.",
          highlightSelector: "[data-tutorial='pantry-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Add items as you shop to keep your inventory current and catch anything expiring soon.",
          highlightSelector: "[data-tutorial='pantry-add']",
          action: "highlight",
        },
      ],
    },
  ],
}
