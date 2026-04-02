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
  },
  {
    page: "/meal-planner",
    title: "Weekly Planner",
    description: "Assign meals to days and let the app handle the rest.",
    substeps: [
      {
        id: 1,
        instruction: "Plan your week here — scheduled meals automatically populate your shopping list.",
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
