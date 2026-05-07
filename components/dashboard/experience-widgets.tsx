"use client"

import type React from "react"
import Link from "next/link"
import { ArrowRight, CalendarCheck, CheckCircle2, ChefHat, Clock3, PiggyBank, Share2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatUsdFromCents } from "@/lib/budget/calculations"
import { useAllocateWeeklySurplus } from "@/hooks/use-budget-dashboard"
import { useManualConfirmStreakMeal } from "@/hooks/use-streak-dashboard"

export type DashboardWidgetState = "enabled" | "hidden" | "loading" | "error" | "empty" | "ready"

type WidgetShellProps = {
  title: string
  eyebrow?: string
  icon: React.ReactNode
  href?: string
  children: React.ReactNode
  className?: string
}

function WidgetShell({ title, eyebrow, icon, href, children, className }: WidgetShellProps) {
  return (
    <Card className={`h-full border-border bg-card ${className ?? ""}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p> : null}
          <CardTitle className="mt-1 text-base">{title}</CardTitle>
        </div>
        <div className="rounded-md bg-muted p-2 text-foreground">{icon}</div>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {href ? (
          <Button variant="ghost" size="sm" className="h-8 px-0" asChild>
            <Link href={href}>
              View
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function LoadingLines() {
  return (
    <div className="space-y-2" aria-label="Loading widget">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
      <div className="h-8 w-28 animate-pulse rounded bg-muted" />
    </div>
  )
}

export function SavingsWidget({ dashboard, isLoading, error }: { dashboard: any; isLoading: boolean; error: unknown }) {
  const allocate = useAllocateWeeklySurplus()

  if (isLoading) {
    return (
      <WidgetShell title="Savings" eyebrow="This week" icon={<PiggyBank className="h-4 w-4" />}>
        <LoadingLines />
      </WidgetShell>
    )
  }

  if (error) {
    return (
      <WidgetShell title="Savings" eyebrow="This week" icon={<PiggyBank className="h-4 w-4" />}>
        <p className="text-sm text-muted-foreground">Savings could not load.</p>
      </WidgetShell>
    )
  }

  const payload = dashboard?.dashboard ?? dashboard
  const activeGoal = payload?.activeGoal
  const summary = payload?.currentWeek?.summary
  const weekStartDate = payload?.currentWeek?.weekStartDate
  const bankableSurplusCents = summary?.bankable_surplus_cents ?? summary?.bankableSurplusCents ?? 0
  const trackedCents = summary?.tracked_spend_cents ?? summary?.trackedSpendCents ?? 0
  const weeklyBudgetCents = summary?.weekly_budget_cents ?? summary?.weeklyBudgetCents ?? 0

  if (!activeGoal) {
    return (
      <WidgetShell title="Savings" eyebrow="Goal jar" icon={<PiggyBank className="h-4 w-4" />}>
        <p className="text-sm text-muted-foreground">Start a savings goal to track weekly progress here.</p>
        <Button size="sm" asChild>
          <Link href="/budget">Set up savings</Link>
        </Button>
      </WidgetShell>
    )
  }

  const balanceCents = activeGoal.currentBalanceCents ?? activeGoal.current_balance_cents ?? 0
  const targetCents = activeGoal.targetCents ?? activeGoal.target_cents ?? 0
  const progressPercent = activeGoal.progressPercent ?? 0

  return (
    <WidgetShell title="Savings" eyebrow="This week" icon={<PiggyBank className="h-4 w-4" />}>
      <div>
        <p className="text-sm font-medium text-foreground">{activeGoal.name ?? "Active goal"}</p>
        <p className="text-xs text-muted-foreground">
          {formatUsdFromCents(balanceCents)} of {formatUsdFromCents(targetCents)} saved
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border p-2">
          <p className="text-muted-foreground">Tracked</p>
          <p className="font-medium">{formatUsdFromCents(trackedCents)}</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-muted-foreground">Weekly goal</p>
          <p className="font-medium">{formatUsdFromCents(weeklyBudgetCents)}</p>
        </div>
      </div>
      <Button
        size="sm"
        className="w-full"
        disabled={allocate.isPending || bankableSurplusCents <= 0 || !weekStartDate}
        onClick={() => allocate.mutate({ weekStartDate })}
      >
        {allocate.isPending
          ? "Banking..."
          : bankableSurplusCents > 0
            ? `Bank ${formatUsdFromCents(bankableSurplusCents)}`
            : "No savings to bank"}
      </Button>
    </WidgetShell>
  )
}

export function StreakWidget({ dashboard, isLoading, error }: { dashboard: any; isLoading: boolean; error: unknown }) {
  const manualConfirm = useManualConfirmStreakMeal()

  if (isLoading) {
    return (
      <WidgetShell title="Cooking rhythm" eyebrow="Today" icon={<CalendarCheck className="h-4 w-4" />}>
        <LoadingLines />
      </WidgetShell>
    )
  }

  if (error) {
    return (
      <WidgetShell title="Cooking rhythm" eyebrow="Today" icon={<CalendarCheck className="h-4 w-4" />}>
        <p className="text-sm text-muted-foreground">Rhythm could not load.</p>
      </WidgetShell>
    )
  }

  const payload = dashboard?.dashboard ?? dashboard
  const pending = payload?.pendingConfirmations ?? []
  const confirmedTryId = manualConfirm.data?.streakDay?.source_recipe_try_id ?? manualConfirm.data?.streakDay?.sourceRecipeTryId

  return (
    <WidgetShell title="Cooking rhythm" eyebrow="Today" icon={<CalendarCheck className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground">Current</p>
          <p className="font-semibold">{payload?.currentCount ?? 0} days</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground">This week</p>
          <p className="font-semibold">{payload?.weeklyCookDialCount ?? 0}/7</p>
        </div>
      </div>
      {pending.length > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {pending.length} meal confirmation{pending.length === 1 ? "" : "s"} waiting.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Log today&apos;s cooking when you are ready.</p>
      )}
      <Button size="sm" className="w-full" disabled={manualConfirm.isPending} onClick={() => manualConfirm.mutate({})}>
        {manualConfirm.isPending ? "Saving..." : "I cooked today"}
      </Button>
      {confirmedTryId ? (
        <Button size="sm" variant="outline" className="w-full" asChild>
          <Link href="/kitchen">Review cook check draft</Link>
        </Button>
      ) : null}
    </WidgetShell>
  )
}

function readSafeProjectionTitle(item: any) {
  const payload = item?.payload ?? {}
  if (typeof payload.title === "string" && payload.title.trim()) return payload.title
  if (typeof payload.caption === "string" && payload.caption.trim()) return payload.caption
  if (typeof payload.summaryLine === "string" && payload.summaryLine.trim()) return payload.summaryLine
  if (typeof payload.progressLabel === "string" && payload.progressLabel.trim()) return payload.progressLabel
  return "Kitchen update"
}

export function KitchenPreviewWidget({
  enabled,
  feed,
  isLoading,
  error,
}: {
  enabled: boolean
  feed: any
  isLoading: boolean
  error: unknown
}) {
  if (!enabled) return null

  if (isLoading) {
    return (
      <WidgetShell title="Kitchen Sync" eyebrow="Friends" icon={<Users className="h-4 w-4" />} href="/kitchen">
        <LoadingLines />
      </WidgetShell>
    )
  }

  if (error) {
    return (
      <WidgetShell title="Kitchen Sync" eyebrow="Friends" icon={<Users className="h-4 w-4" />} href="/kitchen">
        <p className="text-sm text-muted-foreground">Kitchen Sync could not load.</p>
      </WidgetShell>
    )
  }

  const items = (feed?.feed ?? feed ?? []).slice(0, 3)

  return (
    <WidgetShell title="Kitchen Sync" eyebrow="Friends" icon={<Users className="h-4 w-4" />} href="/kitchen">
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item: any) => (
            <div key={item.id} className="rounded-md border p-2">
              <p className="line-clamp-1 text-sm font-medium">{readSafeProjectionTitle(item)}</p>
              <p className="text-xs text-muted-foreground">{item.event_type === "meal_plan_share.published" ? "Shared meal plan" : "Kitchen update"}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No shared kitchen updates yet.</p>
      )}
    </WidgetShell>
  )
}

export function ActiveJourneyWidget({
  enabled,
  journeys,
  isLoading,
  error,
  onProgress,
  updating,
}: {
  enabled: boolean
  journeys: any
  isLoading: boolean
  error: unknown
  onProgress: (journeyId: string) => void
  updating: boolean
}) {
  if (!enabled) return null

  if (isLoading) {
    return (
      <WidgetShell title="Active journey" eyebrow="Progress" icon={<CheckCircle2 className="h-4 w-4" />} href="/kitchen">
        <LoadingLines />
      </WidgetShell>
    )
  }

  if (error) {
    return (
      <WidgetShell title="Active journey" eyebrow="Progress" icon={<CheckCircle2 className="h-4 w-4" />} href="/kitchen">
        <p className="text-sm text-muted-foreground">Journeys could not load.</p>
      </WidgetShell>
    )
  }

  const active = (journeys?.journeys ?? journeys ?? []).find((journey: any) => journey.status === "active")
  if (!active) {
    return (
      <WidgetShell title="Active journey" eyebrow="Progress" icon={<CheckCircle2 className="h-4 w-4" />} href="/kitchen">
        <p className="text-sm text-muted-foreground">No active cooking journey yet.</p>
        <Button size="sm" variant="outline" asChild>
          <Link href="/kitchen">Create journey</Link>
        </Button>
      </WidgetShell>
    )
  }

  const current = active.current_progress ?? active.currentProgress ?? 0
  const target = active.target_count ?? active.targetCount ?? active.target_days ?? active.targetDays ?? 1
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0

  return (
    <WidgetShell title="Active journey" eyebrow="Progress" icon={<CheckCircle2 className="h-4 w-4" />} href="/kitchen">
      <div>
        <p className="text-sm font-medium">{active.title ?? "Cooking journey"}</p>
        <p className="text-xs text-muted-foreground">{current}/{target} complete</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={updating} onClick={() => onProgress(active.id)}>
          {updating ? "Saving..." : "Add progress"}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/kitchen">View Kitchen</Link>
        </Button>
      </div>
    </WidgetShell>
  )
}

export function PendingActionsWidget({
  drafts,
  draftsLoading,
  socialEnabled,
}: {
  drafts: any
  draftsLoading: boolean
  socialEnabled: boolean
}) {
  const draftItems = socialEnabled ? (drafts?.drafts ?? drafts ?? []) : []

  return (
    <WidgetShell title="Pending actions" eyebrow="Next up" icon={<Clock3 className="h-4 w-4" />}>
      {draftsLoading && socialEnabled ? (
        <LoadingLines />
      ) : draftItems.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm">
            {draftItems.length} cook check draft{draftItems.length === 1 ? "" : "s"} waiting.
          </p>
          <Button size="sm" asChild>
            <Link href="/kitchen">Review drafts</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>No cook check drafts waiting.</p>
          <p>No recipe feedback waiting.</p>
        </div>
      )}
    </WidgetShell>
  )
}

export function TodayActionCard() {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-md">Today</Badge>
            <p className="text-sm font-medium">Keep your kitchen moving</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan meals, log cooking, or check what friends are making.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Button size="sm" asChild>
            <Link href="/meal-planner">
              <ChefHat className="mr-1.5 h-4 w-4" />
              Plan
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/kitchen">
              <Share2 className="mr-1.5 h-4 w-4" />
              Kitchen
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
