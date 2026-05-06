"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"

const JOURNEY_TYPES = [
  { value: "cooking_rhythm", label: "Cooking Rhythm" },
  { value: "meal_prep", label: "Meal Prep" },
  { value: "budget_friendly", label: "Budget Friendly" },
  { value: "high_protein", label: "High Protein" },
  { value: "recipe_exploration", label: "Recipe Exploration" },
  { value: "custom", label: "Custom" },
] as const

export function CookingJourneysPanel({
  journeys,
  creating,
  updating,
  completing,
  onCreate,
  onProgress,
  onComplete,
}: {
  journeys: any[]
  creating: boolean
  updating: boolean
  completing: boolean
  onCreate: (input: { title: string; journeyType: string; targetCount: number; visibility: string }) => void
  onProgress: (journeyId: string) => void
  onComplete: (input: { journeyId: string; visibility: string }) => void
}) {
  const [title, setTitle] = useState("21-Day Cooking Rhythm")
  const [journeyType, setJourneyType] = useState("cooking_rhythm")
  const [targetCount, setTargetCount] = useState(21)
  const [visibility, setVisibility] = useState("private")
  const activeJourneys = useMemo(() => journeys.filter((journey) => journey.status !== "archived"), [journeys])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cooking Journeys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7rem_8rem_auto]">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Journey title" />
          <Select value={journeyType} onValueChange={setJourneyType}>
            <SelectTrigger aria-label="Journey type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOURNEY_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            max={365}
            value={targetCount}
            onChange={(event) => setTargetCount(Number(event.target.value) || 1)}
            aria-label="Target count"
          />
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger aria-label="Journey visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="followers">Followers</SelectItem>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            disabled={creating || !title.trim()}
            onClick={() => onCreate({ title, journeyType, targetCount, visibility })}
          >
            Create
          </Button>
        </div>

        {activeJourneys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cooking journeys yet.</p>
        ) : null}

        <div className="grid gap-3">
          {activeJourneys.map((journey) => {
            const current = Number(journey.current_progress) || 0
            const target = Math.max(1, Number(journey.target_count) || 1)
            const percent = Math.min(100, Math.round((current / target) * 100))
            const isCompleted = journey.status === "completed"
            return (
              <div key={journey.id} className="rounded-lg border p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{journey.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {JOURNEY_TYPES.find((type) => type.value === journey.journey_type)?.label ?? "Journey"} · {current}/{target}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={updating || isCompleted}
                      onClick={() => onProgress(journey.id)}
                    >
                      Add Progress
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={completing || isCompleted}
                      onClick={() => onComplete({ journeyId: journey.id, visibility: journey.visibility ?? "private" })}
                    >
                      {isCompleted ? "Completed" : "Complete"}
                    </Button>
                  </div>
                </div>
                <Progress value={percent} className="mt-3 h-2" />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
