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
            // Avoid aggressive retries for auth/config failures.
            retry: (failureCount, error) => {
              const message = error instanceof Error ? error.message : String(error)
              if (message.includes("Supabase client is not configured")) return false
              if (message.includes("401") || message.includes("403")) return false
              return failureCount < 1
            },
            // Reduce broad refetch storms when tab focus changes.
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
