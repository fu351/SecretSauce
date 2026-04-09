import type { GeneralPageEntry } from "../../lib/types/tutorial"

export const generalPages: GeneralPageEntry[] = [
  {
    page: "/dashboard",
    title: "Your Command Center",
    description: "A quick snapshot of where you are and what needs your attention.",
    substeps: [
      {
        id: 1,
        instruction: "The dashboard shows upcoming meals, recent activity, and shortcuts to every part of the app.",
      },
    ],
  },
  {
    page: "/recipes",
    title: "Recipe Library",
    description: "Browse, search, and save recipes that match your goals.",
    substeps: [
      {
        id: 1,
        instruction: "Search and filter the full recipe library by cuisine, dietary needs, or prep time.",
      },
      {
        id: 2,
        instruction: "On mobile, start with the search bar since it stays visible even before the filter panel is opened.",
        highlightSelector: "[data-tutorial='recipe-mobile-search']",
        mobileOnly: true,
      },
      {
        id: 3,
        instruction: "On mobile, tap Filters to open the recipe filter panel and explore the filter options.",
        highlightSelector: "[data-tutorial='recipe-mobile-filters-button']",
        completionSelector: "[data-tutorial='recipe-mobile-filter-dialog']",
        mandatory: true,
        mobileOnly: true,
      },
    ],
    postSubsteps: [
      {
        id: 1,
        instruction: "Tap the X to close the filter panel and return to the recipe list.",
        highlightSelector: "[data-tutorial='recipe-mobile-filters-close']",
        mandatory: true,
        mobileOnly: true,
      },
      {
        id: 2,
        instruction: "Click a recipe card to open its detail page.",
        highlightSelector: "[data-tutorial='recipe-card']",
        mandatory: true,
      },
    ],
  },
  {
    page: "/recipes/*",
    title: "Recipe Detail",
    description: "Everything you need to decide, prepare, and shop for a recipe.",
    substeps: [
      {
        id: 1,
        instruction: "This page has the full ingredient list, step-by-step instructions, and a nutrition summary.",
      },
    ],
    postSubsteps: [
      {
        id: 1,
        instruction: "Favorite this recipe to save it to your collection — you can pull saved recipes directly into your meal plan.",
        highlightSelector: "[data-tutorial='recipe-favorite']",
        mandatory: true,
      },
    ],
  },
  {
    page: "/meal-planner",
    title: "Weekly Planner",
    description: "Assign meals to days and let the app handle the rest.",
    substeps: [
      {
        id: 1,
        instruction: "Plan your week by assigning meals to each day. Scheduled meals automatically populate your shopping list.",
      },
      {
        id: 2,
        instruction: "Today's column is highlighted. Each column holds three meal slots — breakfast, lunch, and dinner.",
        highlightSelector: "[data-tutorial='planner-today']",
      },
      {
        id: 3,
        instruction: "Click the dinner slot in today's column to open the recipe panel.",
        highlightSelector: "[data-tutorial='planner-today-slot']",
        mandatory: true,
        desktopOnly: true,
      },
      {
        id: 4,
        instruction: "Tap the dinner slot in today's column to open the recipe panel.",
        highlightSelector: "[data-tutorial='planner-today-slot']",
        mandatory: true,
        mobileOnly: true,
      },
      {
        id: 5,
        instruction: "The recipe panel lets you browse and search for recipes to drop into any meal slot.",
        highlightSelector: "[data-tutorial='planner-sidebar']",
      },
      {
        id: 6,
        instruction: "Switch to Saved to see the recipe you just favorited.",
        highlightSelector: "[data-tutorial='planner-favorites-tab']",
        mandatory: true,
      },
      {
        id: 7,
        instruction: "Tap a recipe card to add it to today's dinner slot.",
        highlightSelector: "[data-tutorial='planner-sidebar-recipe']",
        completionSelector: "[data-tutorial='planner-today-filled-slot']",
        mandatory: true,
      },
      {
        id: 8,
        instruction: "Your filled day card updates right away, so you can confirm the meal landed where you expected.",
        highlightSelector: "[data-tutorial='planner-today']",
        desktopOnly: true,
      },
      {
        id: 9,
        instruction: "Great — your meal is planned. Close the panel to see the full week.",
        highlightSelector: "[data-tutorial='planner-sidebar-close']",
        mandatory: true,
      },
    ],
  },
  {
    page: "/store",
    title: "Store & Shopping",
    description: "Your consolidated list with live pricing across nearby stores.",
    substeps: [
      {
        id: 1,
        instruction: "Compare totals across stores before you shop, then check off items as you go.",
      },
    ],
    postSubsteps: [
      {
        id: 1,
        instruction: "Head to Home for a quick wrap-up before you jump back into your planning flow.",
        highlightSelector: "[data-tutorial-nav='/home']",
        mandatory: true,
      },
    ],
  },
  {
    page: "/home",
    title: "Thanks for Exploring",
    description: "Take a moment to explore Home and see what is trending, recommended, and worth doing next.",
    substeps: [
      {
        id: 1,
        instruction: "Thanks for taking the tour. Home is a great place to explore featured activity, recipe inspiration, and shortcuts into the rest of the app.",
        highlightSelector: "[data-tutorial='home-overview']",
      },
    ],
    postSubsteps: [
      {
        id: 1,
        instruction: "Spend a moment exploring Home, and when you're ready, click Dashboard to get back to your main cooking overview.",
        highlightSelector: "[data-tutorial-nav='/dashboard']",
        mandatory: true,
      },
    ],
  },
]
