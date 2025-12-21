import { TutorialPath } from "../../lib/types/tutorial"

export const budgetingPath: TutorialPath = {
  id: "budgeting",
  name: "Optimize Resources",
  description: "Save money on groceries",
  steps: [
    {
      id: 1,
      title: "Track your savings",
      description: "See spending trends and budget alerts on your dashboard.",
      page: "/dashboard",
      action: "highlight",
      tips: [
        "Weekly spending shows at a glance",
        "Set budget goals in settings",
        "Price alerts appear in cards",
      ],
    },
    {
      id: 2,
      title: "Add items to compare",
      description: "Use the highlighted button to add grocery items. We'll find prices across stores for you.",
      page: "/shopping",
      highlightSelector: "[data-tutorial='shopping-add-item']",
      action: "highlight",
      tips: [
        "Start with your weekly staples like milk, eggs, bread",
        "Add proteins and produce you buy regularly",
        "More items = better comparisons",
      ],
    },
    {
      id: 3,
      title: "See the cheapest store",
      description: "The comparison table shows where each item is cheapest. Pick your store(s) and save.",
      page: "/shopping",
      highlightSelector: "[data-tutorial='price-comparison']",
      action: "highlight",
      tips: [
        "Compare unit prices to spot savings",
        "Choose one or two stores to minimize trips",
        "Bulk wins if you'll use it",
      ],
    },
    {
      id: 4,
      title: "Find budget recipes",
      description: "Use the recipe filter (highlighted) to find meals that use your priced ingredients.",
      page: "/recipes",
      highlightSelector: "[data-tutorial='recipe-filter']",
      action: "highlight",
      tips: [
        "Look for recipes with common pantry staples",
        "Plan multiple meals using sale ingredients",
        "Quick recipes save on energy costs too",
      ],
    },
    {
      id: 5,
      title: "Plan to save",
      description: "Add recipes to your meal plan (highlighted button) to avoid impulse purchases.",
      page: "/meal-planner",
      highlightSelector: "[data-tutorial='planner-add']",
      action: "highlight",
      tips: [
        "Choose recipes that share ingredients",
        "Cook larger batches to save time and money",
        "Adjust your plan based on what's in your fridge",
      ],
    },
  ],
}