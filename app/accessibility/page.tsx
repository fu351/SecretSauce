import { InfoPage } from "@/app/(info)/info-page"

export default function AccessibilityPage() {
  return (
    <InfoPage
      eyebrow="Accessibility"
      title="Accessibility"
      description="Secret Sauce should be usable by people with different devices, preferences, and access needs."
      sections={[
        {
          title: "Commitment",
          body: "The app aims to support readable text, keyboard access, meaningful labels, responsive layouts, and accessible interaction patterns.",
        },
        {
          title: "Feedback",
          body: "If something is difficult to use with assistive technology or a specific device, contact us with the page, device, and issue so it can be investigated.",
        },
      ]}
    />
  )
}
