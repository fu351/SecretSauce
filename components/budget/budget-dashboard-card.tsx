"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatUsdFromCents } from "@/lib/budget/calculations"

export function BudgetDashboardCard({ goal }: { goal: any }) {
  const balanceCents = goal?.currentBalanceCents ?? goal?.current_balance_cents ?? 0
  const targetCents = goal?.targetCents ?? goal?.target_cents ?? 0
  const progressPercent = goal?.progressPercent ?? 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active goal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{goal?.category ?? "generic"}</p>
        <p className="text-xl font-semibold">{goal?.name ?? "No active goal"}</p>
        <p>
          {formatUsdFromCents(balanceCents)} / {formatUsdFromCents(targetCents)}
        </p>
        <p className="text-sm text-muted-foreground">Progress: {progressPercent}%</p>
      </CardContent>
    </Card>
  )
}
