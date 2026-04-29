import { InfoPage } from "@/app/(info)/info-page"

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Privacy Policy"
      description="This starter privacy page summarizes the types of data Secret Sauce may use to provide cooking, planning, shopping, and account features."
      sections={[
        {
          title: "Information we use",
          body: "Secret Sauce may use account details, recipe activity, pantry entries, meal plans, grocery preferences, location preferences, and feedback you submit.",
        },
        {
          title: "Why it is used",
          body: "This information supports core product features such as recommendations, grocery comparisons, saved preferences, account security, and product improvement.",
        },
        {
          title: "Third-party services",
          body: "The app may rely on providers for authentication, hosting, analytics, payments, maps, storage, and database services. Those services process data needed for their role.",
        },
      ]}
    />
  )
}
