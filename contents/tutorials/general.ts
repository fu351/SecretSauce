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
        instruction: "Tap any recipe card to open its full detail page — ingredients, instructions, and nutrition breakdown.",
        highlightSelector: "[data-tutorial='recipe-card']",
      },
    ],
    postSubsteps: [
      {
        id: 1,
        instruction: "Try clicking a recipe card now to continue the tour on its detail page.",
        highlightSelector: "[data-tutorial='recipe-card']",
        action: "click",
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
        instruction: "Your week is laid out here. Today is highlighted — click on any empty slot in today's column to open the recipe panel.",
        highlightSelector: "[data-tutorial='planner-today']",
      },
      {
        id: 2,
        instruction: "Click the breakfast slot for today to get started.",
        highlightSelector: "[data-tutorial='planner-today-slot']",
        mandatory: true,
      },
    ],
    postSubsteps: [
      {
        id: 1,
        instruction: "The recipe panel is open. Switch to the Saved tab to find the recipe you just favorited.",
        highlightSelector: "[data-tutorial='planner-favorites-tab']",
        mandatory: true,
      },
      {
        id: 2,
        instruction: "Select your favorited recipe to add it to today's meal plan.",
        highlightSelector: "[data-tutorial='planner-sidebar']",
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
  },
  {
    page: "/settings",
    title: "Preferences",
    description: "Your onboarding choices live here — update them as your needs change.",
    substeps: [
      {
        id: 1,
        instruction: "Anything you set during onboarding can be adjusted here at any time.",
      },
    ],
  },
]
