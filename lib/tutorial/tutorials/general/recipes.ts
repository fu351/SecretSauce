import type { GeneralPageEntry } from "../../../types/tutorial"

export const recipeLibraryTutorial: GeneralPageEntry = {
  page: "/recipes",
  title: "Recipe Library",
  description: "Narrow the library first, then browse once the list reflects what you actually want to make.",
  steps: [
    {
      id: 1,
      instruction: "This filter area is your main control center for narrowing by cuisine, dietary needs, or difficulty before you browse.",
      highlightSelector: "[data-tutorial='recipe-filter']",
      desktopOnly: true,
    },
    {
      id: 2,
      instruction: "Search is the fastest way to plan around an ingredient, technique, or kind of dish already on your mind.",
      highlightSelector: "[data-tutorial='recipe-search']",
      desktopOnly: true,
    },
    {
      id: 3,
      instruction: "On mobile, start with the search bar since it stays visible before the filter panel is opened.",
      highlightSelector: "[data-tutorial='recipe-mobile-search']",
      mobileOnly: true,
    },
    {
      id: 4,
      instruction: "On mobile, open Filters when you want to refine the list before you start browsing cards.",
      highlightSelector: "[data-tutorial='recipe-mobile-filters-button']",
      completionSelector: "[data-tutorial='recipe-mobile-filter-dialog']",
      mandatory: true,
      lockInteraction: true,
      mobileOnly: true,
    },
    {
      id: 5,
      instruction: "Close the filter panel to get back to the full recipe list once your filters look right.",
      highlightSelector: "[data-tutorial='recipe-mobile-filters-show-results']",
      mandatory: true,
      lockInteraction: true,
      mobileOnly: true,
    },
    {
      id: 6,
      instruction: "Pick a recipe card to open the detail view and see cost, ingredients, nutrition context, and instructions together.",
      highlightSelector: "[data-tutorial='recipe-card']",
      mandatory: true,
      lockInteraction: true,
    },
  ],
}

export const recipeDetailTutorial: GeneralPageEntry = {
  page: "/recipes/*",
  title: "Recipe Detail",
  description: "Work top-to-bottom through the detail page to evaluate, plan, and act on a recipe before you commit it to the week.",
  steps: [
    {
      id: 1,
      instruction: "Start with the title and description to get a feel for what this recipe is before diving into the details.",
      highlightSelector: "[data-tutorial='recipe-detail-header']",
    },
    {
      id: 2,
      instruction: "The stats panel shows total time, difficulty, servings, and rating. Use these four numbers to decide whether the recipe fits your schedule and skill level today.",
      highlightSelector: "[data-tutorial='recipe-detail-stats']",
    },
    {
      id: 3,
      instruction: "Nutrition shows calories, protein, and fat per serving so you can confirm the recipe fits your macro goals before you cook it.",
      highlightSelector: "[data-tutorial='nutrition-info']",
    },
    {
      id: 4,
      instruction: "Check the tags: cuisine, meal type, protein, and dietary labels tell you at a glance whether this recipe fits your plan.",
      highlightSelector: "[data-tutorial='recipe-detail-tags']",
    },
    {
      id: 5,
      instruction: "The pricing section estimates what this recipe will cost at your store. Check it before adding anything to your shopping list.",
      highlightSelector: "[data-tutorial='recipe-detail-pricing']",
    },
    {
      id: 6,
      instruction: "Review the ingredient list to see exactly what you need and spot where this recipe overlaps with other meals in your plan.",
      highlightSelector: "[data-tutorial='recipe-detail-ingredients']",
    },
    {
      id: 7,
      instruction: "Send all ingredients to your shopping list in one tap. The button stays disabled until every ingredient has been matched to a store product.",
      highlightSelector: "[data-tutorial='recipe-add-to-cart']",
      blockClick: true,
    },
    {
      id: 8,
      instruction: "Read through the steps to gauge the technique and pacing before you commit this recipe to the week.",
      highlightSelector: "[data-tutorial='recipe-detail-instructions']",
    },
    {
      id: 9,
      instruction: "On mobile, Start Cooking launches a step-by-step mode so you can follow the recipe hands-free while you cook.",
      highlightSelector: "[data-tutorial='recipe-start-cooking']",
      blockClick: true,
      mobileOnly: true,
    },
    {
      id: 10,
      instruction: "Check the reviews to see how other cooks rated this recipe and what tweaks they recommended.",
      highlightSelector: "[data-tutorial='recipe-reviews']",
    },
    {
      id: 11,
      instruction: "Open Save so you can put this recipe into a folder. Saved folder recipes appear in the planner's Saved tab.",
      highlightSelector: "[data-tutorial='recipe-favorite']",
      completionSelector: "[data-tutorial='recipe-save-dialog']",
      mandatory: true,
      lockInteraction: true,
    },
    {
      id: 12,
      instruction: "Choose a folder for this recipe. The default folder is perfect for the tutorial.",
      highlightSelector: "[data-tutorial='recipe-save-folder-option']",
      completionSelector: "[data-tutorial='recipe-saved-confirmation']",
      mandatory: true,
      lockInteraction: true,
    },
    {
      id: 13,
      instruction: "Close the folder dialog so you can schedule the saved recipe in the meal planner.",
      highlightSelector: "[data-tutorial='recipe-save-dialog-done']",
      mandatory: true,
      lockInteraction: true,
    },
  ],
}
