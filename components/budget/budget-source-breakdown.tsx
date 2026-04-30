"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatUsdFromCents } from "@/lib/budget/calculations"

export function BudgetSourceBreakdown({ summary }: { summary: any }) {
  const manualCents = summary?.manual_spend_cents ?? summary?.manualSpendCents ?? 0
  const receiptCents = summary?.receipt_spend_cents ?? summary?.receiptSpendCents ?? 0
  const totalCents = summary?.tracked_spend_cents ?? summary?.trackedSpendCents ?? 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Source breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>manual: {formatUsdFromCents(manualCents)}</p>
        <p>receipt: {formatUsdFromCents(receiptCents)}</p>
        <p>total: {formatUsdFromCents(totalCents)}</p>
      </CardContent>
    </Card>
  )
}
