import { TutorialPath } from "./types"

export const cookingPath: TutorialPath = {
  id: "cooking",
  name: "Mastering the Craft",
  description: "Learn to cook with confidence",
  steps: [
  {
    id: 1,
    title: "Your dashboard",
    description: "This is your control center — everything starts here.",
    page: "/dashboard",
    action: "highlight",
    estimatedSeconds: 25,
    substeps: [
        {
          id: 1,
          instruction: "These cards are shortcuts to your core tools.",
          highlightSelector: "[data-tutorial='dashboard-stats']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Use quick actions to add recipes or plan meals fast.",
          highlightSelector: "[data-tutorial='dashboard-actions']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Pick up where you left off with recent recipes.",
          highlightSelector: "[data-tutorial='dashboard-recents']",
          action: "highlight",
        },
      ],
      tips: [
        "You can always return here by clicking the logo",
        "Everything else in the app connects back to this page",
      ],
    },
    {
      id: 2,
      title: "Filter recipes fast",
      description: "Use the filter panel to narrow by difficulty, cuisine, and cook time.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-filter']",
      action: "highlight",
      tips: [
        "Try 'Beginner' + <30 minutes to start",
        "Combine filters for precise results",
        "Clear filters anytime to see everything",
      ],
    },
    {
      id: 3,
      title: "Open a recipe",
      description: "Use any recipe card to see ingredients, timing, and the save (heart) button.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-card']",
      action: "highlight",
      tips: [
        "Tap the heart to save favorites",
        "Scan ingredients before you cook",
        "Scroll for nutrition and reviews",
      ],
    },
    {
      id: 4,
      title: "Plan your week",
      description: "Click the highlighted button to add recipes to your weekly meal plan.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='meal-plan-add']",
      action: "highlight",
      tips: [
        "Save quick meals for busy nights",
        "Plan with shared ingredients to reduce waste",
        "Drag and drop to rearrange",
      ],
    },
    {
      id: 5,
      title: "Compare prices",
      description: "Your shopping list shows prices across stores so you can pick the cheapest trip.",
      page: "/shopping",
      highlightSelector: "[data-tutorial='shopping-list']",
      action: "highlight",
      tips: [
        "Each store shows its price per item",
        "Check off items as you shop",
        "Adjust quantities for items you already have",
      ],
    },
  ],
}