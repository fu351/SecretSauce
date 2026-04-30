"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAllocateWeeklySurplus } from "@/hooks/use-budget-dashboard"

export function BudgetWeeklyWrapCard({ summary, weekStartDate }: { summary: any; weekStartDate: string }) {
  const allocate = useAllocateWeeklySurplus()
  const bankableSurplusCents = summary?.bankable_surplus_cents ?? summary?.bankableSurplusCents ?? 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly wrap</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">Week start: {weekStartDate}</p>
        <p>Bankable surplus: {bankableSurplusCents} cents</p>
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
