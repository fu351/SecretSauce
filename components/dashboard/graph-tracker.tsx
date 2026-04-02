"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/contexts/theme-context"
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

type MacroDatum = {
  day: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

type WasteDatum = {
  day: string
  wasteKg: number
  rescuedKg: number
}

type BudgetDatum = {
  week: string
  spent: number
  budget: number
}

function hashStringToInt(input: string) {
  // Simple deterministic hash -> 32-bit int for stable fake data per user.
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function GraphTracker() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const [activeIndex, setActiveIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement | null>(null)

  const categories = useMemo(
    () => [
      { label: "Macros", icon: <Flame className="h-4 w-4" />, index: 0 },
      { label: "Budget", icon: <Coins className="h-4 w-4" />, index: 1 },
      { label: "Waste", icon: <Trash2 className="h-4 w-4" />, index: 2 },
    ],
    [],
  )

  const scrollToIndex = useCallback((idx: number) => {
    const el = carouselRef.current
    if (!el) return
    const child = el.children[idx] as HTMLElement | null
    child?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })
  }, [])

  useEffect(() => {
    const el = carouselRef.current
    if (!el) return

    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        const width = el.clientWidth
        if (!width) return
        const idx = Math.round(el.scrollLeft / width)
        setActiveIndex(Math.max(0, Math.min(categories.length - 1, idx)))
      })
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      el.removeEventListener("scroll", onScroll)
    }
  }, [categories.length])

  // Fake datasets for now (until backend endpoints exist for these metrics).
  // Seed based on a stable value so the graph doesn't “jump” on re-renders.
  const { macroData, wasteData, budgetData, macroHitCount, totalWasteKg, savingsTotal } = useMemo(() => {
    const seed = hashStringToInt("macro-waste-budget-v1")
    const rand = mulberry32(seed)

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    const caloriesTarget = 2050
    const proteinTarget = 155
    const carbsTarget = 210
    const fatTarget = 70

    const macroData: MacroDatum[] = days.map((day, idx) => {
      // Gentle week pattern + noise
      const cycle = Math.sin((idx / (days.length - 1)) * Math.PI * 2)
      const noise = () => (rand() - 0.5)
      const calories = Math.round(caloriesTarget * (1 + 0.06 * cycle + 0.03 * noise()))
      const protein = Math.round(proteinTarget * (1 + 0.08 * cycle + 0.04 * noise()))
      const carbs = Math.round(carbsTarget * (1 + 0.07 * cycle + 0.04 * noise()))
      const fat = Math.round(fatTarget * (1 + 0.06 * cycle + 0.04 * noise()))
      return { day, calories, protein, carbs, fat }
    })

    const macroHitCount = macroData.reduce((acc, d) => {
      const caloriesHit = Math.abs(d.calories - caloriesTarget) / caloriesTarget <= 0.1
      const proteinHit = Math.abs(d.protein - proteinTarget) / proteinTarget <= 0.12
      return acc + (caloriesHit && proteinHit ? 1 : 0)
    }, 0)

    const wasteDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    const wasteData: WasteDatum[] = wasteDays.map((day, idx) => {
      const cycle = Math.cos((idx / (wasteDays.length - 1)) * Math.PI * 2)
      const wasteKg = Math.max(0.2, Math.round((1.6 + 0.35 * cycle + 0.25 * (rand() - 0.5)) * 10) / 10)
      const rescuedKg = Math.max(0.0, Math.round((wasteKg * (0.35 + 0.15 * rand())) * 10) / 10)
      return { day, wasteKg, rescuedKg }
    })

    const totalWasteKg = wasteData.reduce((a, b) => a + b.wasteKg, 0)

    const budgetData: BudgetDatum[] = ["Wk 1", "Wk 2", "Wk 3", "Wk 4"].map((week, i) => {
      const budget = 180
      const spent = Math.round((budget * (0.78 + 0.25 * rand())) * 10) / 10
      return { week, spent, budget }
    })

    const savingsTotal = budgetData.reduce((acc, d) => acc + Math.max(0, d.budget - d.spent), 0)

    return { macroData, wasteData, budgetData, macroHitCount, totalWasteKg, savingsTotal }
  }, [])

  const gridStroke = isDark ? "rgba(232,220,196,0.14)" : "rgba(10,10,10,0.08)"
  const text = isDark ? "#e8dcc4" : "#111827"
  const muted = isDark ? "rgba(232,220,196,0.65)" : "rgba(17,24,39,0.55)"

  const caloriesColor = isDark ? "#fb923c" : "#f97316"
  const proteinColor = isDark ? "#4ade80" : "#16a34a"
  const carbsColor = isDark ? "#60a5fa" : "#2563eb"
  const fatColor = isDark ? "#c084fc" : "#7c3aed"

  const wasteColor = isDark ? "#fb7185" : "#ef4444"

  const spentColor = isDark ? "#34d399" : "#22c55e"
  const budgetLineColor = isDark ? "#fbbf24" : "#f59e0b"

  return (
    <Card className="mb-8 border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <PieChart className="h-5 w-5 text-primary" />
          Graph Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Category pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((c) => {
            const selected = c.index === activeIndex
            return (
              <Button
                key={c.index}
                type="button"
                variant={selected ? "default" : "outline"}
                size="sm"
                className="rounded-full whitespace-nowrap h-9"
                onClick={() => scrollToIndex(c.index)}
              >
                <span className="mr-2">{c.icon}</span>
                {c.label}
              </Button>
            )
          })}
        </div>

        {/* Swipeable carousel */}
        <div
          ref={carouselRef}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide [-webkit-overflow-scrolling:touch] w-full"
        >
          {/* Macros */}
          <div className="min-w-full snap-start p-1">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Flame className="h-4 w-4 text-primary" />
                    Macros (last 7 days)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Hit target (calories + protein): {macroHitCount}/7 days</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Targets</p>
                  <p className="text-sm font-semibold text-foreground">~2050 cal, 155g protein</p>
                </div>
              </div>
              <div className="h-[220px] w-full">
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
              </div>
            </div>
          </div>

          {/* Budget */}
          <div className="min-w-full snap-start p-1">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" />
                    Budget (last 4 weeks)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Savings vs target: ${savingsTotal.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Spent vs budget</p>
                  <p className="text-sm font-semibold text-foreground">USD/week</p>
                </div>
              </div>
              <div className="h-[220px] w-full">
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
              </div>
            </div>
          </div>

          {/* Waste */}
          <div className="min-w-full snap-start p-1">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Waste (last 7 days)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Total waste: {totalWasteKg.toFixed(1)} kg</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">kg/day</p>
                </div>
              </div>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={wasteData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                    <Legend verticalAlign="top" height={28} iconType="circle" />
                    <Bar dataKey="wasteKg" name="Waste (kg)" fill={wasteColor} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Note: charts use placeholder data until these metrics are wired to backend sources.
        </p>
      </CardContent>
    </Card>
  )
}

