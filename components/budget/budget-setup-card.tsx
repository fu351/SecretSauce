"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useCreateBudgetGoal } from "@/hooks/use-budget-dashboard"
import { formatUsdFromCents } from "@/lib/budget/calculations"

export function BudgetSetupCard() {
  const createGoal = useCreateBudgetGoal()
  const [name, setName] = useState("Japan Trip")
  const [category, setCategory] = useState("travel")
  const [targetCents, setTargetCents] = useState(100000)
  const [weeklyBudgetCents, setWeeklyBudgetCents] = useState(25000)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start your first savings goal</CardTitle>
        <CardDescription>Create a goal and weekly budget to begin tracking surplus.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Goal name" />
        <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="travel">travel</option>
          <option value="concert">concert</option>
          <option value="gaming">gaming</option>
          <option value="dining">dining</option>
          <option value="generic">generic</option>
        </select>
        <Input
          type="number"
          value={targetCents}
          onChange={(event) => setTargetCents(Number(event.target.value))}
          placeholder="Target (cents)"
        />
        <p className="text-xs text-muted-foreground">Target preview: {formatUsdFromCents(targetCents || 0)}</p>
        <Input
          type="number"
          value={weeklyBudgetCents}
          onChange={(event) => setWeeklyBudgetCents(Number(event.target.value))}
          placeholder="Weekly budget (cents)"
        />
        <p className="text-xs text-muted-foreground">Weekly budget preview: {formatUsdFromCents(weeklyBudgetCents || 0)}</p>
        <Button
          disabled={createGoal.isPending}
          onClick={() =>
            createGoal.mutate({
              name,
              category,
              targetCents,
              weeklyBudgetCents,
            })
          }
        >
          {createGoal.isPending ? "Creating..." : "Create goal"}
        </Button>
      </CardContent>
    </Card>
  )
}
