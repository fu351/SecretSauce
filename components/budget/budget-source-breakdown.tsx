"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function BudgetSourceBreakdown({ summary }: { summary: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Source breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>manual: {summary?.manual_spend_cents ?? summary?.manualSpendCents ?? 0} cents</p>
        <p>receipt: {summary?.receipt_spend_cents ?? summary?.receiptSpendCents ?? 0} cents</p>
        <p>total: {summary?.tracked_spend_cents ?? summary?.trackedSpendCents ?? 0} cents</p>
      </CardContent>
    </Card>
  )
}
