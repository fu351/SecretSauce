"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLogBudgetSpend } from "@/hooks/use-budget-dashboard"

export function BudgetSpendQuickAdd() {
  const logSpend = useLogBudgetSpend()
  const [amountCents, setAmountCents] = useState(1500)
  const [sourceType, setSourceType] = useState<"manual" | "receipt">("manual")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick add spend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="number"
          value={amountCents}
          onChange={(event) => setAmountCents(Number(event.target.value))}
          placeholder="Amount (cents)"
        />
        <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2" value={sourceType} onChange={(event) => setSourceType(event.target.value as "manual" | "receipt")}>
          <option value="manual">manual</option>
          <option value="receipt">receipt</option>
        </select>
        <Button disabled={logSpend.isPending} onClick={() => logSpend.mutate({ amountCents, sourceType })}>
          {logSpend.isPending ? "Saving..." : "Log spend"}
        </Button>
      </CardContent>
    </Card>
  )
}
