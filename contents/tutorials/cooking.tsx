import { TutorialPath } from "./types"

export const cookingPath: TutorialPath = {
  id: "cooking",
  name: "Mastering the Craft",
  description: "Learn to cook with confidence",
  steps: [
    // STEP 1: DASHBOARD
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

    // STEP 2: RECIPES (Combined Filter + Card)
    {
      id: 2,
      title: "Discover Recipes",
      description: "Find the perfect meal using filters or browse the collection.",
      page: "/recipes",
      action: "highlight",
      // Default to the first element (filter) if no substep is active
      highlightSelector: "[data-tutorial='recipe-filter']", 
      estimatedSeconds: 45,
      substeps: [
        {
          id: 1,
          instruction: "Use the filter panel to narrow results by difficulty, cuisine, or dietary needs.",
          highlightSelector: "[data-tutorial='recipe-filter']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Click any recipe card to view full details, ingredients, and save it to favorites.",
          // Uses the ID we added to the first card in the Grid/List view
          highlightSelector: "#tutorial-recipe-card", 
          action: "highlight",
        },
      ],
      tips: [
        "Try 'Beginner' + <30 minutes to start",
        "Clear filters anytime to see everything",
        "Tap the heart icon on a card to save it instantly",
      ],
    },

    // STEP 3: MEAL PLANNER (Renumbered)
    {
      id: 3,
      title: "Plan your week",
      description: "Click the highlighted button to add recipes to your weekly meal plan.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-add']",
      action: "highlight",
      tips: [
        "Save quick meals for busy nights",
        "Plan with shared ingredients to reduce waste",
        "Drag and drop to rearrange",
      ],
    },

    // STEP 4: SHOPPING (Renumbered)
    {
      id: 4,
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