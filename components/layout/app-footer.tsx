"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

const footerGroups = [
  {
    title: "Product",
    links: [
      { label: "Recipes", href: "/recipes" },
      { label: "Meal Planner", href: "/meal-planner" },
      { label: "Shopping", href: "/store" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help", href: "/help" },
      { label: "Contact Support", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
]

function shouldHideFooter(pathname: string | null) {
  if (!pathname) return false
  return (
    pathname.startsWith("/auth") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/dev")
  )
}

export function AppFooter() {
  const pathname = usePathname()

  if (shouldHideFooter(pathname)) return null

  const openFeedback = () => {
    window.dispatchEvent(new CustomEvent("open-feedback-widget"))
  }

  return (
    <footer className="hidden border-t bg-background md:block">
      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10">
        <div className="max-w-xs flex-1">
          <Link href="/home" prefetch={false} className="font-serif text-2xl text-foreground">
            Secret Sauce
          </Link>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Cook smarter, plan meals, compare groceries, and keep your kitchen moving.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-5 gap-2" onClick={openFeedback}>
            <MessageCircle className="h-4 w-4" />
            Send Feedback
          </Button>
        </div>

        <nav className="grid flex-[2] grid-cols-4 gap-6" aria-label="Footer">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h2 className="text-sm font-medium text-foreground">{group.title}</h2>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={`${group.title}-${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      prefetch={false}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  )
}
