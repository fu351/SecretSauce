"use client"

import { useState, useCallback, useRef } from "react"
import { startOfWeek, addDays, format } from "date-fns"

interface UseDatePaginationReturn {
  dates: string[]
  loadMoreFuture: () => void
  loadMorePast: () => void
  resetToCurrentWeek: () => void
  todayIndex: number
}

function generateDateRange(startDate: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) =>
    format(addDays(startDate, i), "yyyy-MM-dd")
  )
}

export function useDatePagination(initialDays = 14, batchSize = 14): UseDatePaginationReturn {
  const loadingRef = useRef(false)

  // Initialize with dates starting from Monday of the current week
  const [dates, setDates] = useState<string[]>(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 }) // 1 = Monday
    return generateDateRange(monday, initialDays)
  })

  const loadMoreFuture = useCallback(() => {
    if (loadingRef.current) return
    loadingRef.current = true

    setDates((prev) => {
      if (prev.length === 0) return prev

      const lastDate = new Date(prev[prev.length - 1])
      const nextStart = addDays(lastDate, 1)
      const newDates = generateDateRange(nextStart, batchSize)

      // Ensure no duplicates by filtering out any dates that already exist
      const existingDates = new Set(prev)
      const uniqueNewDates = newDates.filter(date => !existingDates.has(date))

      return [...prev, ...uniqueNewDates]
    })

    // Reset loading flag after a short delay to prevent rapid-fire calls
    setTimeout(() => {
      loadingRef.current = false
    }, 100)
  }, [batchSize])

  const loadMorePast = useCallback(() => {
    if (loadingRef.current) return
    loadingRef.current = true

    setDates((prev) => {
      if (prev.length === 0) return prev

      const firstDate = new Date(prev[0])
      const newStartDate = addDays(firstDate, -batchSize)
      const newDates = generateDateRange(newStartDate, batchSize)

      // Ensure no duplicates by filtering out any dates that already exist
      const existingDates = new Set(prev)
      const uniqueNewDates = newDates.filter(date => !existingDates.has(date))

      return [...uniqueNewDates, ...prev]
    })

    // Reset loading flag after a short delay to prevent rapid-fire calls
    setTimeout(() => {
      loadingRef.current = false
    }, 100)
  }, [batchSize])

  const resetToCurrentWeek = useCallback(() => {
    // Reset to Monday of the current week with initialDays worth of dates
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
    setDates(generateDateRange(monday, initialDays))
  }, [initialDays])

  // Calculate today's index in the dates array
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const todayIndex = dates.findIndex((d) => d === todayStr)

  return {
    dates,
    loadMoreFuture,
    loadMorePast,
    resetToCurrentWeek,
    todayIndex: todayIndex >= 0 ? todayIndex : 0,
  }
}
