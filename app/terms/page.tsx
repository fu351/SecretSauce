import { InfoPage } from "@/app/(info)/info-page"

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Terms of Service"
      description="These starter terms explain the expected use of Secret Sauce. They should be reviewed before being treated as final legal language."
      sections={[
        {
          title: "Use of the service",
          body: "Use Secret Sauce responsibly and only for lawful purposes. Do not misuse the app, attempt to disrupt the service, or upload content that violates another person's rights.",
        },
        {
          title: "Content and recipes",
          body: "You are responsible for content you add to the app. Recipe, grocery, nutrition, and pricing information may be incomplete or change over time.",
        },
        {
          title: "Changes",
          body: "The service may change as features are improved. Continued use after updates means you accept the updated terms.",
        },
      ]}
    />
  )
}
