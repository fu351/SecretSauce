"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAllocateWeeklySurplus } from "@/hooks/use-budget-dashboard"
import { formatUsdFromCents } from "@/lib/budget/calculations"

export function BudgetWeeklyWrapCard({ summary, weekStartDate }: { summary: any; weekStartDate: string }) {
  const allocate = useAllocateWeeklySurplus()
  const bankableSurplusCents = summary?.bankable_surplus_cents ?? summary?.bankableSurplusCents ?? 0
  const rawSurplusCents = summary?.raw_surplus_cents ?? summary?.rawSurplusCents ?? 0
  const weeklyBudgetCents = summary?.weekly_budget_cents ?? summary?.weeklyBudgetCents ?? 0
  const trackedCents = summary?.tracked_spend_cents ?? summary?.trackedSpendCents ?? 0
  const isOverBudgetWeek = trackedCents > weeklyBudgetCents && rawSurplusCents <= 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly wrap</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">Week start: {weekStartDate}</p>
        <p>Bankable surplus: {formatUsdFromCents(bankableSurplusCents)}</p>
        {isOverBudgetWeek ? (
          <p className="text-sm text-muted-foreground">This week ran over budget. No savings was moved, and you can reset next week.</p>
        ) : null}
        <Button
          disabled={allocate.isPending || bankableSurplusCents <= 0}
          onClick={() => allocate.mutate({ weekStartDate })}
        >
          {allocate.isPending ? "Allocating..." : "Bank surplus"}
        </Button>
      </CardContent>
    </Card>
  )
}
