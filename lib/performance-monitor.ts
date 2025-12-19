export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: Map<string, number[]> = new Map()
  private slowQueryThreshold = 2000 // 2 seconds

  private constructor() {
    if (typeof window !== "undefined") {
      // Log metrics every 30 seconds
      setInterval(() => this.logMetrics(), 30000)
    }
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  trackQuery(table: string, duration: number) {
    if (!this.metrics.has(table)) {
      this.metrics.set(table, [])
    }
    this.metrics.get(table)!.push(duration)

    // Alert on slow queries
    if (duration > this.slowQueryThreshold) {
      console.warn(`[v0] SLOW QUERY DETECTED: ${table} took ${duration.toFixed(2)}ms`)
    }
  }

  private logMetrics() {
    if (this.metrics.size === 0) return

    console.log("[v0] Performance Metrics Summary:")
    this.metrics.forEach((durations, table) => {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length
      const max = Math.max(...durations)
      const min = Math.min(...durations)
      console.log(
        `[v0] ${table}: avg=${avg.toFixed(2)}ms, min=${min.toFixed(2)}ms, max=${max.toFixed(2)}ms, count=${durations.length}`,
      )
    })

    // Clear old metrics
    this.metrics.clear()
  }

  logMemoryUsage() {
    if (typeof window !== "undefined" && "memory" in performance) {
      const memory = (performance as any).memory
      console.log("[v0] Memory Usage:", {
        usedJSHeapSize: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`,
        totalJSHeapSize: `${(memory.totalJSHeapSize / 1048576).toFixed(2)} MB`,
        jsHeapSizeLimit: `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`,
      })
    }
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance()
