import { getWeek, getYear } from "date-fns"

export function getCurrentWeekIndex(): number {
  const now = new Date()
  return getYear(now) * 100 + getWeek(now, { weekStartsOn: 1 })
}

export function getDatesForWeek(weekIndex: number): Date[] {
  const year = Math.floor(weekIndex / 100)
  const week = weekIndex % 100
  const d = new Date(year, 0, 1)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff + (week - 1) * 7)

  const dates: Date[] = []
  for (let i = 0; i < 7; i++) {
    dates.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i))
  }
  return dates
}
