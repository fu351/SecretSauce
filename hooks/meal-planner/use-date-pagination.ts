"use client"

import { useState, useCallback, useRef } from "react"

interface UseDatePaginationReturn {
  dates: string[]
  loadMoreFuture: () => void
  loadMorePast: () => void
  todayIndex: number
}

function generateDateRange(startDate: Date, days: number): string[] {
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    dates.push(d.toISOString().split("T")[0])
  }
  return dates
}

export function useDatePagination(initialDays = 14, batchSize = 14): UseDatePaginationReturn {
  const loadingRef = useRef(false)

  // Initialize with dates centered around today
  const [dates, setDates] = useState<string[]>(() => {
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - Math.floor(initialDays / 2))
    return generateDateRange(startDate, initialDays)
  })

  const loadMoreFuture = useCallback(() => {
    if (loadingRef.current) return
    loadingRef.current = true

    setDates((prev) => {
      if (prev.length === 0) return prev

      const lastDate = new Date(prev[prev.length - 1])
      const nextStart = new Date(lastDate)
      nextStart.setDate(lastDate.getDate() + 1)

      const newDates = generateDateRange(nextStart, batchSize)
      return [...prev, ...newDates]
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
      const newEndDate = new Date(firstDate)
      newEndDate.setDate(firstDate.getDate() - 1)

      const newStartDate = new Date(newEndDate)
      newStartDate.setDate(newEndDate.getDate() - batchSize + 1)

      const newDates = generateDateRange(newStartDate, batchSize)
      return [...newDates, ...prev]
    })

    // Reset loading flag after a short delay to prevent rapid-fire calls
    setTimeout(() => {
      loadingRef.current = false
    }, 100)
  }, [batchSize])

  // Calculate today's index in the dates array
  const todayStr = new Date().toISOString().split("T")[0]
  const todayIndex = dates.findIndex((d) => d === todayStr)

  return {
    dates,
    loadMoreFuture,
    loadMorePast,
    todayIndex: todayIndex >= 0 ? todayIndex : 0,
  }
}
