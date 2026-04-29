import { InfoPage } from "@/app/(info)/info-page"

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="About"
      title="About Secret Sauce"
      description="Secret Sauce helps home cooks discover recipes, plan meals, compare grocery options, and keep a more organized kitchen."
      sections={[
        {
          title: "What we build for",
          body: "The product is designed for everyday cooking decisions: what to make, what ingredients you already have, what to buy, and how to make meals fit your week.",
        },
        {
          title: "How it works",
          body: "Secret Sauce combines recipe discovery, meal planning, pantry tracking, shopping support, and social cooking features into one cooking workspace.",
        },
      ]}
    />
  )
}
