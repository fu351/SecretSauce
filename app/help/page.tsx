import { InfoPage } from "@/app/(info)/info-page"

export default function HelpPage() {
  return (
    <InfoPage
      eyebrow="Support"
      title="Help"
      description="Find the main areas of Secret Sauce and where to go when something needs attention."
      sections={[
        {
          title: "Recipes and meal planning",
          body: "Use Recipes to discover ideas and Meal Planner to organize what you want to cook during the week.",
        },
        {
          title: "Pantry and shopping",
          body: "Use Pantry to track ingredients you already have and Shopping to compare grocery options for planned meals.",
        },
        {
          title: "Account help",
          body: "Use Settings for email, password, appearance, location, tutorial, support, legal, and account actions.",
        },
      ]}
    />
  )
}
