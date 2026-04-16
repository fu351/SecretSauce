import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import { vi } from "vitest"

export function createMockRouter(overrides: Partial<ReturnType<typeof useRouter>> = {}) {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useRouter>
}

export function mockRouter(overrides: Partial<ReturnType<typeof useRouter>> = {}) {
  const router = createMockRouter(overrides)
  vi.mocked(useRouter).mockReturnValue(router)
  return router
}

export function mockSearchParams(
  value: string | URLSearchParams | Record<string, string> = ""
) {
  const params =
    value instanceof URLSearchParams
      ? value
      : typeof value === "string"
        ? new URLSearchParams(value)
        : new URLSearchParams(value)

  vi.mocked(useSearchParams).mockReturnValue(params as ReturnType<typeof useSearchParams>)
  return params
}

export function mockParams<T extends Record<string, string>>(value: T) {
  vi.mocked(useParams).mockReturnValue(value as ReturnType<typeof useParams>)
  return value
}

export function mockPathname(pathname: string) {
  vi.mocked(usePathname).mockReturnValue(pathname)
  return pathname
}
