"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function BudgetDashboardCard({ goal }: { goal: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active goal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{goal?.category ?? "generic"}</p>
        <p className="text-xl font-semibold">{goal?.name ?? "No active goal"}</p>
        <p>
          {goal?.currentBalanceCents ?? 0} / {goal?.targetCents ?? 0} cents
        </p>
        <p className="text-sm text-muted-foreground">Progress: {goal?.progressPercent ?? 0}%</p>
      </CardContent>
    </Card>
  )
}
