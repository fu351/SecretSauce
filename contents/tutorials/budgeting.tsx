import { TutorialPath } from "../../lib/types/tutorial"

export const budgetingPath: TutorialPath = {
  id: "budgeting",
  name: "Optimize Resources",
  description: "Build your shopping list and compare local store totals in one place.",
  steps: [
    {
      id: 1,
      title: "Shopping Workspace",
      description: "Everything you need in one place.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-overview']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Your shopping list lives here — review item quantities and keep everything in one running receipt.",
          highlightSelector: "[data-tutorial='store-overview']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "Use Quick Add to include extra household items before you compare totals.",
          highlightSelector: "[data-tutorial='store-add']",
          action: "highlight",
        },
      ],
    },
    {
      id: 2,
      title: "Store Comparison",
      description: "Pick the store that wins on your specific list.",
      page: "/store",
      highlightSelector: "[data-tutorial='store-selector']",
      action: "highlight",
      substeps: [
        {
          id: 1,
          instruction: "Switch between store options to compare totals and choose the best value for your current list.",
          highlightSelector: "[data-tutorial='store-selector']",
          action: "highlight",
          essential: true,
        },
        {
          id: 2,
          instruction: "The receipt updates as your list changes, so you can optimize cost before checkout.",
          highlightSelector: "[data-tutorial='store-overview']",
          action: "highlight",
        },
      ],
    },
  ],
}
