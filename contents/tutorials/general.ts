import type { GeneralPageEntry } from "../../lib/types/tutorial"

export const generalPages: GeneralPageEntry[] = [
  {
    page: "/dashboard",
    title: "Your Command Center",
    description: "Start with the high-level view, then work downward into what deserves attention next.",
    substeps: [
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
    substeps: [
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
    ],
    postSubsteps: [
      {
        id: 1,
        instruction: "Close the filter panel to get back to the full recipe list once your filters look right.",
        highlightSelector: "[data-tutorial='recipe-mobile-filters-close']",
        mandatory: true,
        mobileOnly: true,
      },
      {
        id: 2,
        instruction: "Pick a recipe card to open the detail view and see cost, ingredients, nutrition context, and instructions together.",
        highlightSelector: "[data-tutorial='recipe-card']",
        mandatory: true,
      },
    ],
  },
  {
    page: "/recipes/*",
    title: "Recipe Detail",
    description: "Use the detail page to decide whether a recipe fits your plan before you commit it to the week.",
    substeps: [
      {
        id: 1,
        instruction: "Check the tags first to confirm the recipe fits the style of meal or dietary direction you want.",
        highlightSelector: "[data-tutorial='recipe-detail-tags']",
      },
      {
        id: 2,
        instruction: "The pricing section helps you judge cost before this recipe turns into shopping list items.",
        highlightSelector: "[data-tutorial='recipe-detail-pricing']",
      },
      {
        id: 3,
        instruction: "Review the ingredient list to see what you need to buy and where overlap with other meals might help.",
        highlightSelector: "[data-tutorial='recipe-detail-ingredients']",
      },
      {
        id: 4,
        instruction: "Scan the instructions to understand the effort, pacing, and technique before you add the recipe to your routine.",
        highlightSelector: "[data-tutorial='recipe-detail-instructions']",
      },
    ],
    postSubsteps: [
      {
        id: 1,
        instruction: "Favorite this recipe so it is easy to find from the planner when you are ready to schedule it.",
        highlightSelector: "[data-tutorial='recipe-favorite']",
        mandatory: true,
      },
    ],
  },
  {
    page: "/meal-planner",
    title: "Weekly Planner",
    description: "Move from week-level planning into one real scheduling action, then back out to confirm the result.",
    substeps: [
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
    substeps: [
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
    ],
    postSubsteps: [
      {
        id: 1,
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
    substeps: [
      {
        id: 1,
        instruction: "Home is a good place to browse inspiration, featured content, and shortcuts back into the rest of the app.",
        highlightSelector: "[data-tutorial='home-overview']",
      },
    ],
    postSubsteps: [
      {
        id: 1,
        instruction: "When you are ready, go back to Dashboard to start using everything you just toured.",
        highlightSelector: "[data-tutorial-nav='/dashboard']",
        mandatory: true,
      },
    ],
  },
]
