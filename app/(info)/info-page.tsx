import Link from "next/link"

type InfoPageProps = {
  title: string
  eyebrow: string
  description: string
  sections: Array<{
    title: string
    body: string
  }>
}

export function InfoPage({ title, eyebrow, description, sections }: InfoPageProps) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-3 font-serif text-4xl text-foreground md:text-5xl">{title}</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">{description}</p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="border-t pt-6">
              <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/home"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Back to Home
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium text-foreground"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </main>
  )
}
