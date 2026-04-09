import type { GeneralPageEntry } from "../../lib/types/tutorial"

export const generalPages: GeneralPageEntry[] = [
  {
    page: "/dashboard",
    title: "Your Command Center",
    description: "Start with the high-level view, then work downward into what deserves attention next.",
    steps: [
      {
        id: 1,
        instruction: "Start with your stats for a quick snapshot of recipes, favorites, planned meals, and shopping activity.",
        highlightSelector: "[data-tutorial='dashboard-stats']",
      },
      {
        id: 2,
        instruction: "The activity tracker helps you spot trends before you decide what to cook, plan, or improve next.",
        highlightSelector: "[data-tutorial='dashboard-actions']",
      },
      {
        id: 3,
        instruction: "Recent Recipes gives you a fast way to jump back into dishes you have already explored.",
        highlightSelector: "[data-tutorial='dashboard-recents']",
      },
    ],
  },
  {
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
        mobileOnly: true,
      },
      {
        id: 5,
        instruction: "Close the filter panel to get back to the full recipe list once your filters look right.",
        highlightSelector: "[data-tutorial='recipe-mobile-filters-close']",
        mandatory: true,
        mobileOnly: true,
      },
      {
        id: 6,
        instruction: "Pick a recipe card to open the detail view and see cost, ingredients, nutrition context, and instructions together.",
        highlightSelector: "[data-tutorial='recipe-card']",
        mandatory: true,
      },
    ],
  },
  {
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
        instruction: "Check the tags — cuisine, meal type, protein, and dietary labels tell you at a glance whether this recipe fits your plan.",
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
        instruction: "Favorite this recipe so it shows up in the planner's Saved tab when you are ready to schedule it for the week.",
        highlightSelector: "[data-tutorial='recipe-favorite']",
        mandatory: true,
      },
    ],
  },
  {
    page: "/meal-planner",
    title: "Weekly Planner",
    description: "Move from week-level planning into one real scheduling action, then back out to confirm the result.",
    steps: [
      {
        id: 1,
        instruction: "Smart Plan is the quickest way to draft a week before you make manual adjustments.",
        highlightSelector: "[data-tutorial='planner-smart']",
      },
      {
        id: 2,
        instruction: "This full-week view helps you spot balance, repetition, and where ingredient overlap can save work later.",
        highlightSelector: "[data-tutorial='planner-overview']",
      },
      {
        id: 3,
        instruction: "Today's column is highlighted here so you always know exactly which day you are editing.",
        highlightSelector: "[data-tutorial='planner-today']",
      },
      {
        id: 4,
        instruction: "Open today's dinner slot so you can schedule the recipe you just saved.",
        highlightSelector: "[data-tutorial='planner-today-slot']",
        mandatory: true,
        desktopOnly: true,
      },
      {
        id: 5,
        instruction: "Open today's dinner slot so you can schedule the recipe you just saved.",
        highlightSelector: "[data-tutorial='planner-today-slot']",
        mandatory: true,
        mobileOnly: true,
      },
      {
        id: 6,
        instruction: "The recipe panel is where search, saved recipes, and slot assignment all come together.",
        highlightSelector: "[data-tutorial='planner-sidebar']",
      },
      {
        id: 7,
        instruction: "Switch to Saved so the recipe you favorited is ready to drop into the plan.",
        highlightSelector: "[data-tutorial='planner-favorites-tab']",
        mandatory: true,
      },
      {
        id: 8,
        instruction: "Choose the saved recipe to add it to today's dinner slot.",
        highlightSelector: "[data-tutorial='planner-sidebar-recipe']",
        completionSelector: "[data-tutorial='planner-today-filled-slot']",
        mandatory: true,
      },
      {
        id: 9,
        instruction: "Your filled day card updates right away, so you can verify the meal landed where you expected.",
        highlightSelector: "[data-tutorial='planner-today']",
      },
      {
        id: 10,
        instruction: "Close the panel to return to the full planner once the meal is scheduled.",
        highlightSelector: "[data-tutorial='planner-sidebar-close']",
        mandatory: true,
      },
    ],
  },
  {
    page: "/store",
    title: "Store & Shopping",
    description: "Review the shopping outcome from top to bottom before you move on.",
    steps: [
      {
        id: 1,
        instruction: "Start with the store switcher so you know which store's pricing and availability you are reviewing.",
        highlightSelector: "[data-tutorial='store-selector']",
      },
      {
        id: 2,
        instruction: "The running total is the fastest health check for whether the current plan still feels right.",
        highlightSelector: "[data-tutorial='store-total']",
      },
      {
        id: 3,
        instruction: "Review the item list to catch missing quantities, overlaps, or anything that looks off before checkout.",
        highlightSelector: "[data-tutorial='store-items']",
      },
      {
        id: 4,
        instruction: "If anything is missing, this section shows where substitutes or another store might still be worth it.",
        highlightSelector: "[data-tutorial='store-missing']",
      },
      {
        id: 5,
        instruction: "Head to Home for a quick wrap-up before you return to your everyday dashboard flow.",
        highlightSelector: "[data-tutorial-nav='/home']",
        mandatory: true,
      },
    ],
  },
  {
    page: "/home",
    title: "Thanks for Exploring",
    description: "Finish the tour here, then jump back to the dashboard when you are ready to use the app for real.",
    steps: [
      {
        id: 1,
        instruction: "Home is a good place to browse inspiration, featured content, and shortcuts back into the rest of the app.",
        highlightSelector: "[data-tutorial='home-overview']",
      },
      {
        id: 2,
        instruction: "When you are ready, go back to Dashboard to start using everything you just toured.",
        highlightSelector: "[data-tutorial-nav='/dashboard']",
        mandatory: true,
      },
    ],
  },
]
