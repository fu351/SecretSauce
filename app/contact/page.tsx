import { InfoPage } from "@/app/(info)/info-page"

export default function ContactPage() {
  return (
    <InfoPage
      eyebrow="Contact"
      title="Contact Secret Sauce"
      description="Reach out about support issues, feedback, accessibility concerns, account questions, or product suggestions."
      sections={[
        {
          title: "Support",
          body: "For account, recipe, meal planning, pantry, or shopping issues, include what page you were using and what you expected to happen.",
        },
        {
          title: "Feedback",
          body: "Use the in-app feedback button when available. It gives the team product context and helps route the request faster.",
        },
      ]}
    />
  )
}
