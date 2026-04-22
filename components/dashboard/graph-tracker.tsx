"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/contexts/theme-context"
import { useAuth } from "@/contexts/auth-context"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ComposedChart,
  Area,
} from "recharts"
import { Flame, PieChart, Trash2, Coins } from "lucide-react"
import { format, getWeek, getYear } from "date-fns"
import { mealPlannerDB, type MealScheduleRow } from "@/lib/database/meal-planner-db"
import { pantryItemsDB } from "@/lib/database/pantry-items-db"
import { storeListHistoryDB } from "@/lib/database/store-list-history-db"
import type { Recipe } from "@/lib/types"

type MacroDatum = {
  day: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

type PantryExpiryDatum = {
  day: string
  items: number
}

type BudgetDatum = {
  week: string
  spent: number
  budget: number
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function rollingLocalDates(days: number): string[] {
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() - i)
    out.push(formatLocalYmd(d))
  }
  return out
}

type TimeRange = "week" | "month" | "ytd" | "year"
type TrackerCategory = "macros" | "budget" | "pantry"

function datesForRange(range: TimeRange): string[] {
  if (range === "week") return rollingLocalDates(7)
  if (range === "month") return rollingLocalDates(30)

  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const start = new Date(today)
  if (range === "ytd") {
    start.setMonth(0, 1)
  } else {
    start.setDate(start.getDate() - 364)
  }

  const out: string[] = []
  const cursor = new Date(start)
  while (cursor <= today) {
    out.push(formatLocalYmd(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

function shiftWeekIndex(weekIndex: number, delta: number): number {
  let year = Math.floor(weekIndex / 100)
  let week = weekIndex % 100
  let remaining = delta
  while (remaining !== 0) {
    if (remaining > 0) {
      if (week < 52) week++
      else {
        year++
        week = 1
      }
      remaining--
    } else {
      if (week > 1) week--
      else {
        year--
        week = 52
      }
      remaining++
    }
  }
  return year * 100 + week
}

function shortDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()]
}

function chartLabelForDate(ymd: string, range: TimeRange): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  if (range === "week") return shortDayLabel(ymd)
  if (range === "month") return format(dt, "MMM d")
  return format(dt, "MMM")
}

function currentWeekIndex(): number {
  const now = new Date()
  return getYear(now) * 100 + getWeek(now, { weekStartsOn: 1 })
}

function budgetWindowWeeks(range: TimeRange): number {
  if (range === "week") return 4
  if (range === "month") return 8
  if (range === "ytd") return Math.max(4, Math.min(52, getWeek(new Date(), { weekStartsOn: 1 })))
  return 52
}

function weeklyBudgetUsd(budgetRange: string | null | undefined): number {
  switch (budgetRange) {
    case "low":
      return 120
    case "high":
      return 320
    case "medium":
    default:
      return 200
  }
}

const DEFAULT_CAL_TARGET = 2000
const DEFAULT_PROTEIN_TARGET = 150

function expiryYmd(iso: string | null): string | null {
  if (!iso) return null
  return iso.slice(0, 10)
}

function aggregateMacrosForDates(
  dates: string[],
  meals: MealScheduleRow[],
  recipesById: Record<string, Recipe>
): MacroDatum[] {
  const dateSet = new Set(dates)
  const totals: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {}
  dates.forEach((d) => {
    totals[d] = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  })

  for (const meal of meals) {
    if (!dateSet.has(meal.date)) continue
    const recipe = recipesById[meal.recipe_id]
    if (!recipe?.nutrition) continue
    const t = totals[meal.date]
    if (!t) continue
    t.calories += recipe.nutrition.calories || 0
    t.protein += recipe.nutrition.protein || 0
    t.carbs += recipe.nutrition.carbs || 0
    t.fat += recipe.nutrition.fat || 0
  }

  return dates.map((ymd) => ({
    day: shortDayLabel(ymd),
    calories: Math.round(totals[ymd].calories),
    protein: Math.round(totals[ymd].protein),
    carbs: Math.round(totals[ymd].carbs),
    fat: Math.round(totals[ymd].fat),
  }))
}

export function GraphTracker() {
  const { theme } = useTheme()
  const { user, profile } = useAuth()
  const isDark = theme === "dark"
  const [activeCategory, setActiveCategory] = useState<TrackerCategory>("macros")
  const [timeRange, setTimeRange] = useState<TimeRange>("week")

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [macroData, setMacroData] = useState<MacroDatum[]>([])
  const [macroDaysTracked, setMacroDaysTracked] = useState(0)
  const [pantryExpiryData, setPantryExpiryData] = useState<PantryExpiryDatum[]>([])
  const [totalExpiringWeek, setTotalExpiringWeek] = useState(0)
  const [budgetData, setBudgetData] = useState<BudgetDatum[]>([])
  const [budgetSavingsHint, setBudgetSavingsHint] = useState(0)

  const categories = useMemo(
    () => [
      { id: "macros" as const, label: "Macros", icon: <Flame className="h-4 w-4" /> },
      { id: "budget" as const, label: "Budget", icon: <Coins className="h-4 w-4" /> },
      { id: "pantry" as const, label: "Pantry", icon: <Trash2 className="h-4 w-4" /> },
    ],
    [],
  )
  const rangeOptions = useMemo(
    () => [
      { id: "week" as const, label: "Week" },
      { id: "month" as const, label: "Month" },
      { id: "ytd" as const, label: "YTD" },
      { id: "year" as const, label: "Year" },
    ],
    [],
  )

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      setMacroData([])
      setPantryExpiryData([])
      setBudgetData([])
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadError(null)

    ;(async () => {
      try {
        const dates = datesForRange(timeRange)
        const weekBudget = weeklyBudgetUsd(profile?.budget_range)

        const cur = currentWeekIndex()
        const budgetWeeks = budgetWindowWeeks(timeRange)
        const weekIndices = Array.from({ length: budgetWeeks }, (_, idx) => shiftWeekIndex(cur, -(budgetWeeks - 1 - idx)))

        const [meals, pantryItems, ...historyWeeks] = await Promise.all([
          mealPlannerDB.fetchMealScheduleByDateRange(user.id, dates[0], dates[dates.length - 1]),
          pantryItemsDB.findByUserId(user.id, { includeExpired: true }),
          ...weekIndices.map((wi) => storeListHistoryDB.findByUserAndWeek(user.id, wi)),
        ])

        if (cancelled) return

        const recipeIds = [...new Set(meals.map((m) => m.recipe_id).filter(Boolean))]
        const recipes = recipeIds.length ? await mealPlannerDB.fetchRecipesByIds(recipeIds) : []
        const recipesById: Record<string, Recipe> = {}
        recipes.forEach((r) => {
          recipesById[r.id] = r
        })

        const macros = aggregateMacrosForDates(dates, meals, recipesById)
          .map((row, idx) => ({
            ...row,
            day: chartLabelForDate(dates[idx], timeRange),
          }))
        const tracked = macros.filter((d) => d.calories > 0 || d.protein > 0).length

        const expiryByDay: Record<string, number> = {}
        dates.forEach((d) => {
          expiryByDay[d] = 0
        })
        for (const item of pantryItems) {
          const ymd = expiryYmd(item.expiry_date)
          if (ymd && expiryByDay[ymd] !== undefined) {
            expiryByDay[ymd] += 1
          }
        }
        const pantryChart: PantryExpiryDatum[] = dates.map((ymd) => ({
          day: chartLabelForDate(ymd, timeRange),
          items: expiryByDay[ymd] ?? 0,
        }))
        const expiringInWindow = pantryItems.filter((it) => {
          const ymd = expiryYmd(it.expiry_date)
          if (!ymd) return false
          return ymd >= dates[0] && ymd <= dates[dates.length - 1]
        }).length

        const budgetChart: BudgetDatum[] = weekIndices.map((wi, i) => {
          const rows = historyWeeks[i] ?? []
          const spent = rows.reduce((sum, r) => sum + (Number(r.total_item_price) || 0), 0)
          return {
            week: `W${wi % 100}`,
            spent: Math.round(spent * 100) / 100,
            budget: weekBudget,
          }
        })

        const savingsHint = budgetChart.reduce((acc, d) => acc + Math.max(0, d.budget - d.spent), 0)

        setMacroData(macros)
        setMacroDaysTracked(tracked)
        setPantryExpiryData(pantryChart)
        setTotalExpiringWeek(expiringInWindow)
        setBudgetData(budgetChart)
        setBudgetSavingsHint(Math.round(savingsHint * 100) / 100)
      } catch (e) {
        console.error("[GraphTracker] load failed", e)
        if (!cancelled) setLoadError("Could not load chart data.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id, profile?.budget_range, timeRange])

  const gridStroke = isDark ? "rgba(232,220,196,0.14)" : "rgba(10,10,10,0.08)"
  const text = isDark ? "#e8dcc4" : "#111827"
  const muted = isDark ? "rgba(232,220,196,0.65)" : "rgba(17,24,39,0.55)"

  const caloriesColor = isDark ? "#fb923c" : "#f97316"
  const proteinColor = isDark ? "#4ade80" : "#16a34a"
  const carbsColor = isDark ? "#60a5fa" : "#2563eb"
  const fatColor = isDark ? "#c084fc" : "#7c3aed"

  const expiryColor = isDark ? "#fb7185" : "#ef4444"

  const spentColor = isDark ? "#34d399" : "#22c55e"
  const budgetLineColor = isDark ? "#fbbf24" : "#f59e0b"

  if (!user?.id) {
    return null
  }

  return (
    <Card className="mb-8 border-border bg-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-foreground flex items-center gap-2 text-2xl font-medium">
          <PieChart className="h-5 w-5 text-primary" />
          Progress Insights
        </CardTitle>
        <p className="text-sm text-muted-foreground">Track nutrition, spend, and pantry trends over time.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-2xl border bg-background p-1">
            {categories.map((c) => {
              const selected = c.id === activeCategory
              return (
                <Button
                  key={c.id}
                  type="button"
                  variant={selected ? "default" : "ghost"}
                  size="sm"
                  className="rounded-xl px-4"
                  onClick={() => setActiveCategory(c.id)}
                >
                  <span className="mr-2">{c.icon}</span>
                  {c.label}
                </Button>
              )
            })}
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl border bg-background p-1">
            {rangeOptions.map((option) => {
              const selected = option.id === timeRange
              return (
                <Button
                  key={option.id}
                  type="button"
                  variant={selected ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-lg px-3 h-8"
                  onClick={() => setTimeRange(option.id)}
                >
                  {option.label}
                </Button>
              )
            })}
          </div>
        </div>

        {activeCategory === "macros" && (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Flame className="h-4 w-4 text-primary" />
                  Macros ({timeRange.toUpperCase()})
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  From planned meals with nutrition - {macroDaysTracked}/{macroData.length} days with data
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Reference targets</p>
                <p className="text-sm font-semibold text-foreground">
                  ~{DEFAULT_CAL_TARGET} cal, {DEFAULT_PROTEIN_TARGET}g protein
                </p>
              </div>
            </div>
            <div className="h-[280px] w-full">
              {loading ? (
                <div className="h-full w-full rounded-lg bg-muted/40 animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={macroData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke={gridStroke} strokeDasharray="4 6" />
                    <XAxis dataKey="day" tick={{ fill: muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: isDark ? "rgba(15, 15, 15, 0.92)" : "rgba(255,255,255,0.95)",
                        border: `1px solid ${isDark ? "rgba(232,220,196,0.18)" : "rgba(10,10,10,0.08)"}`,
                        borderRadius: 12,
                      }}
                      labelStyle={{ color: text }}
                    />
                    <Legend verticalAlign="top" height={28} iconType="circle" formatter={(value) => value} />
                    <Line type="monotone" dataKey="calories" name="Calories" stroke={caloriesColor} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="protein" name="Protein (g)" stroke={proteinColor} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="carbs" name="Carbs (g)" stroke={carbsColor} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="fat" name="Fat (g)" stroke={fatColor} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {activeCategory === "budget" && (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Coins className="h-4 w-4 text-primary" />
                  Delivery spend ({timeRange.toUpperCase()})
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Delivery log totals vs profile budget tier ({`~$${weeklyBudgetUsd(profile?.budget_range)}/wk`})
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Under budget</p>
                <p className="text-sm font-semibold text-foreground">${budgetSavingsHint.toFixed(2)}</p>
              </div>
            </div>
            <div className="h-[280px] w-full">
              {loading ? (
                <div className="h-full w-full rounded-lg bg-muted/40 animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={budgetData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke={gridStroke} strokeDasharray="4 6" />
                    <XAxis dataKey="week" tick={{ fill: muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: isDark ? "rgba(15, 15, 15, 0.92)" : "rgba(255,255,255,0.95)",
                        border: `1px solid ${isDark ? "rgba(232,220,196,0.18)" : "rgba(10,10,10,0.08)"}`,
                        borderRadius: 12,
                      }}
                      labelStyle={{ color: text }}
                    />
                    <Legend verticalAlign="top" height={28} iconType="circle" />
                    <Bar dataKey="spent" name="Spent" fill={spentColor} radius={[8, 8, 0, 0]} />
                    <Area type="monotone" dataKey="budget" name="Budget" stroke={budgetLineColor} fill="transparent" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {activeCategory === "pantry" && (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Pantry expirations ({timeRange.toUpperCase()})
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Count of items with an expiry date in the selected window
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Items in window</p>
                <p className="text-sm font-semibold text-foreground">{totalExpiringWeek}</p>
              </div>
            </div>
            <div className="h-[280px] w-full">
              {loading ? (
                <div className="h-full w-full rounded-lg bg-muted/40 animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pantryExpiryData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke={gridStroke} strokeDasharray="4 6" />
                    <XAxis dataKey="day" tick={{ fill: muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: isDark ? "rgba(15, 15, 15, 0.92)" : "rgba(255,255,255,0.95)",
                        border: `1px solid ${isDark ? "rgba(232,220,196,0.18)" : "rgba(10,10,10,0.08)"}`,
                        borderRadius: 12,
                      }}
                      labelStyle={{ color: text }}
                    />
                    <Legend verticalAlign="top" height={28} iconType="circle" />
                    <Bar dataKey="items" name="Items" fill={expiryColor} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Macros come from your meal planner and recipe nutrition. Budget compares delivery log totals to your profile
          budget tier. Pantry counts use expiry dates you have saved.
        </p>
      </CardContent>
    </Card>
  )
}
