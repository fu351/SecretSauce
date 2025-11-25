"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache data for 5 minutes by default
            staleTime: 5 * 60 * 1000,
            // Keep unused data in cache for 10 minutes
            gcTime: 10 * 60 * 1000,
            // Retry failed requests once
            retry: 1,
            // Refetch on window focus only if data is stale
            refetchOnWindowFocus: "always",
            // Refetch on reconnect only if data is stale
            refetchOnReconnect: "always",
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
