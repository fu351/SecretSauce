import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useStreakDashboard: vi.fn(),
  useFoundationFeatureFlag: vi.fn(),
  useFeaturePreferences: vi.fn(),
}))

vi.mock("@/hooks/use-streak-dashboard", () => ({
  useStreakDashboard: mocks.useStreakDashboard,
  useManualConfirmStreakMeal: () => ({ isPending: false, mutate: vi.fn() }),
  useCreateStreakVerification: () => ({ isPending: false, mutate: vi.fn() }),
  useConfirmStreakVerification: () => ({ isPending: false, mutate: vi.fn() }),
  useUseStreakFreeze: () => ({ isPending: false, mutate: vi.fn() }),
  useApplyStreakGrace: () => ({ isPending: false, mutate: vi.fn() }),
}))

vi.mock("@/hooks/use-feature-flag", () => ({
  useFoundationFeatureFlag: mocks.useFoundationFeatureFlag,
}))

vi.mock("@/hooks/use-feature-preferences", () => ({
  useFeaturePreferences: mocks.useFeaturePreferences,
}))

import StreaksPage from "@/app/streaks/page"

describe("streak components", () => {
  it("renders disabled state", () => {
    mocks.useFoundationFeatureFlag.mockReturnValue({ isEnabled: false })
    mocks.useFeaturePreferences.mockReturnValue({ preferences: { streaksEnabled: true } })
    mocks.useStreakDashboard.mockReturnValue({ isLoading: false, error: null, data: null })
    render(<StreaksPage />)
    expect(screen.getByText("Streaks are disabled")).toBeInTheDocument()
  })

  it("renders empty state dashboard", () => {
    mocks.useFoundationFeatureFlag.mockReturnValue({ isEnabled: true })
    mocks.useFeaturePreferences.mockReturnValue({ preferences: { streaksEnabled: true } })
    mocks.useStreakDashboard.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        dashboard: {
          currentCount: 0,
          longestCount: 0,
          freezeTokens: 0,
          weeklyCookDialCount: 0,
          recentDays: [],
          pendingConfirmations: [],
        },
      },
    })
    render(<StreaksPage />)
    expect(screen.getByRole("heading", { name: "Streaks" })).toBeInTheDocument()
    expect(screen.getByText("I cooked today")).toBeInTheDocument()
  })

  it("renders neutral freeze/grace copy", () => {
    mocks.useFoundationFeatureFlag.mockReturnValue({ isEnabled: true })
    mocks.useFeaturePreferences.mockReturnValue({ preferences: { streaksEnabled: true } })
    mocks.useStreakDashboard.mockReturnValue({
      isLoading: false,
      error: null,
      data: { dashboard: { currentCount: 2, longestCount: 5, freezeTokens: 1, weeklyCookDialCount: 2, recentDays: [], pendingConfirmations: [] } },
    })
    render(<StreaksPage />)
    expect(screen.getByText("Rhythm paused. Pick up tomorrow.")).toBeInTheDocument()
    expect(screen.queryByText(/streak broken/i)).not.toBeInTheDocument()
  })
})
