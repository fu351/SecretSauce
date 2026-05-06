import type { GeneralPageEntry } from "../../../types/tutorial"

export const storeTutorial: GeneralPageEntry = {
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
      instruction: "Review the item list to catch missing quantities, overlaps, or anything that looks off before checkout.",
      highlightSelector: "[data-tutorial='store-items']",
    },
    {
      id: 3,
      instruction: "If anything is missing, this section shows where substitutes or another store might still be worth it.",
      highlightSelector: "[data-tutorial='store-missing']",
    },
    {
      id: 4,
      instruction: "The running total is the fastest health check for whether the current plan still feels right.",
      highlightSelector: "[data-tutorial='store-total']",
    },
    {
      id: 5,
      instruction: "Head to Home for a quick wrap-up before you return to your everyday dashboard flow.",
      highlightSelector: "[data-tutorial-nav='/home']",
      mandatory: true,
      lockInteraction: true,
    },
  ],
}
