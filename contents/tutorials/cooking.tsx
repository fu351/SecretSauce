import { TutorialPath } from "../../lib/types/tutorial"

export const cookingPath: TutorialPath = {
  id: "cooking",
  name: "Mastering the Craft",
  description: "A deep dive into recipe discovery and kitchen organization.",
  steps: [
    {
      id: 1,
      title: "Command Center",
      description: "Manage your culinary workflow from one spot.",
      page: "/dashboard",
      highlightSelector: "[data-tutorial='dashboard-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Start with the dashboard overview to check your daily schedule.",
          highlightSelector: "[data-tutorial='dashboard-overview']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Quickly revisit that amazing dish you made yesterday in 'Recents'.",
          highlightSelector: "[data-tutorial='dashboard-recents']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Access your personalized hall-of-fame via your 'Favorites'.",
          highlightSelector: "[data-tutorial='dashboard-actions']",
          action: "highlight",
        }
      ]
    },
    {
      id: 2,
      title: "Advanced Recipe Discovery",
      description: "Find the perfect meal for any occasion.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Enter the recipe library to see featured collections.",
          highlightSelector: "[data-tutorial='recipe-overview']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Use the search bar to find recipes by ingredient or title.",
          highlightSelector: "[data-tutorial='recipe-search']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Apply filters to match your current skill level or cooking time.",
          highlightSelector: "[data-tutorial='recipe-filter']",
          action: "highlight",
        },
        {
          id: 4,
          instruction: "Interact with a Recipe Card to see detailed instructions.",
          highlightSelector: "[data-tutorial='recipe-card']",
          action: "highlight",
        }
      ]
    },
    {
      id: 3,
      title: "The Weekly Planner",
      description: "Bridge the gap between recipes and your calendar.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "View your broader weekly pannel for an overview of your meals.",
          highlightSelector: "[data-tutorial='planner-overview']",
          action: "highlight",
        },
        {
          id: 2,
          instruction: "Use the sidebar to see available recipes you can drag into your week.",
          highlightSelector: "[data-tutorial='planner-sidebar']",
          action: "highlight",
        },
        {
          id: 3,
          instruction: "Need a snack? Use the 'Add' button to manually insert items.",
          highlightSelector: "[data-tutorial='planner-add']",
          action: "highlight",
        }
      ]
    }
  ]
}