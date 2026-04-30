"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDismissBudgetNudge } from "@/hooks/use-budget-dashboard"

export function BudgetNudgeCard({ nudge }: { nudge: any }) {
  const dismiss = useDismissBudgetNudge()
  if (!nudge) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keep your goal moving</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          It has been at least {nudge.thresholdDays ?? 21} days since your last contribution.
        </p>
        <Button variant="outline" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
          {dismiss.isPending ? "Dismissing..." : "Dismiss for now"}
        </Button>
      </CardContent>
    </Card>
  )
}
