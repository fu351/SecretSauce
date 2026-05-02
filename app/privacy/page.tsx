import { InfoPage } from "@/app/(info)/info-page"

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Privacy Policy"
      description="This page explains what Secret Sauce collects, why it is collected, and how you can control optional cookies and third-party services."
      sections={[
        {
          title: "Information we collect",
          body: "Secret Sauce may process account details, authentication/session data, recipe activity, social activity, pantry entries, meal plans, grocery preferences, feedback, and device or usage information needed to operate the product.",
        },
        {
          title: "Cookies and local storage",
          body: "Necessary cookies keep sign-in, security, and basic site functionality working. If you opt in, optional analytics cookies may be used for product analytics and third-party cookies may be used for services such as maps, routing, and address autocomplete. The site also uses browser storage for product preferences and UI state, including tutorial progress, temporary drafts, and cached interface data.",
        },
        {
          title: "Why we use this information",
          body: "We use this information to authenticate users, provide recipes and social features, save preferences, support grocery and meal-planning tools, improve reliability, and understand how the product is used when analytics is enabled.",
        },
        {
          title: "Third-party processors",
          body: "Secret Sauce may rely on providers for authentication, hosting, analytics, maps, routing, payments, storage, and database services. These providers process data only to provide the services we use them for. Analytics and map services are not loaded unless you opt in through cookie settings.",
        },
        {
          title: "Retention and deletion",
          body: "We keep data only as long as needed for the product, legal, security, and operational purposes described here. Some content can be removed or restored by administrators, while account and transactional records may be retained for security, audit, or legal reasons.",
        },
        {
          title: "Your choices",
          body: "You can use cookie settings to allow or disable optional analytics and third-party cookies at any time. You can also manage account settings, sign out, and contact us if you want help accessing, correcting, or deleting information where applicable.",
        },
        {
          title: "Contact",
          body: "For privacy questions, use the Contact page or reach out through the support channels listed in the app. If you change your mind about cookie preferences, use Cookie settings in the footer or Settings page.",
        },
      ]}
    />
  )
}
