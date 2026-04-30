"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  useApplyStreakGrace,
  useConfirmStreakVerification,
  useCreateStreakVerification,
  useManualConfirmStreakMeal,
  useUseStreakFreeze,
} from "@/hooks/use-streak-dashboard"

export function StreakDashboardCard({ dashboard }: { dashboard: any }) {
  const manualConfirm = useManualConfirmStreakMeal()
  const createVerification = useCreateStreakVerification()
  const confirmVerification = useConfirmStreakVerification()
  const useFreeze = useUseStreakFreeze()
  const applyGrace = useApplyStreakGrace()

  const recentDays = dashboard?.recentDays ?? []
  const pending = dashboard?.pendingConfirmations ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Streaks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground">Current</p>
            <p className="text-xl font-semibold">{dashboard?.currentCount ?? 0} days</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground">Longest</p>
            <p className="text-xl font-semibold">{dashboard?.longestCount ?? 0} days</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground">Weekly cook dial</p>
            <p className="text-xl font-semibold">{dashboard?.weeklyCookDialCount ?? 0}/7</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground">Freeze tokens</p>
            <p className="text-xl font-semibold">{dashboard?.freezeTokens ?? 0}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Recent days</p>
          <div className="flex gap-2">
            {recentDays.slice(0, 7).map((day: any) => (
              <div key={day.streak_date} className="rounded border px-2 py-1 text-xs">
                {day.streak_date}: {day.status}
              </div>
            ))}
            {recentDays.length === 0 ? <p className="text-xs text-muted-foreground">No streak days yet.</p> : null}
          </div>
        </div>

        {pending.length > 0 ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{pending.length} confirmation{pending.length === 1 ? "" : "s"} pending. Confirm to count your day.</p>
            <div className="flex flex-wrap gap-2">
              {pending.slice(0, 3).map((item: any) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant="outline"
                  disabled={confirmVerification.isPending}
                  onClick={() => confirmVerification.mutate({ verificationTaskId: item.id })}
                >
                  Confirm meal
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={manualConfirm.isPending}
            onClick={() => manualConfirm.mutate({})}
          >
            {manualConfirm.isPending ? "Saving..." : "I cooked today"}
          </Button>
          <Button
            variant="outline"
            disabled={createVerification.isPending}
            onClick={() => createVerification.mutate({})}
          >
            {createVerification.isPending ? "Starting..." : "Start meal verification"}
          </Button>
          <Button
            variant="outline"
            disabled={useFreeze.isPending}
            onClick={() => useFreeze.mutate({})}
          >
            {useFreeze.isPending ? "Applying..." : "Use freeze"}
          </Button>
          <Button
            variant="outline"
            disabled={applyGrace.isPending}
            onClick={() => applyGrace.mutate({})}
          >
            {applyGrace.isPending ? "Applying..." : "Apply grace"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">Rhythm paused. Pick up tomorrow.</p>
      </CardContent>
    </Card>
  )
}
