"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useSwitchBudgetGoal } from "@/hooks/use-budget-dashboard"

export function BudgetSwitchGoalDialog() {
  const switchGoal = useSwitchBudgetGoal()
  const [name, setName] = useState("New Goal")
  const [category, setCategory] = useState("generic")
  const [targetCents, setTargetCents] = useState(120000)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Switch goal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New goal name" />
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
        <Button
          disabled={switchGoal.isPending}
          onClick={() => switchGoal.mutate({ name, category, targetCents })}
        >
          {switchGoal.isPending ? "Switching..." : "Switch active goal"}
        </Button>
      </CardContent>
    </Card>
  )
}
