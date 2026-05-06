import type { GeneralPageEntry } from "../../../types/tutorial"

export const homeSearchTutorial: GeneralPageEntry = {
  page: "/home",
  title: "Home Search",
  description: "On mobile, Home is the fastest way to look up recipes and people before you jump deeper into the app.",
  steps: [
    {
      id: 1,
      instruction: "Home is your mobile discovery hub. Use the search button here when you want to find a recipe or look up another cook.",
      highlightSelector: "[data-tutorial='home-mobile-search-button']",
      completionSelector: "[data-tutorial='home-search-overlay']",
      mandatory: true,
      lockInteraction: true,
      mobileOnly: true,
    },
    {
      id: 2,
      instruction: "This search panel can find recipes and, when you are signed in, people by name or username.",
      highlightSelector: "[data-tutorial='home-search-overlay']",
      mobileOnly: true,
    },
    {
      id: 3,
      instruction: "Continue into the recipe library from here. This keeps the tour aligned with the mobile navigation.",
      highlightSelector: "[data-tutorial='home-browse-recipes']",
      mandatory: true,
      lockInteraction: true,
      mobileOnly: true,
    },
  ],
}

export const homeWrapUpTutorial: GeneralPageEntry = {
  page: "/home",
  title: "Thanks for Exploring",
  description: "Finish the tour here, then jump back to the dashboard when you are ready to use the app for real.",
  steps: [
    {
      id: 1,
      instruction: "Home brings together search, inspiration, featured content, and shortcuts back into the rest of the app.",
    },
    {
      id: 2,
      instruction: "When you are ready, go back to Dashboard to start using everything you just toured.",
      highlightSelector: "[data-tutorial-nav='/dashboard']",
    },
  ],
}
