import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useBudgetDashboard: vi.fn(),
  useFoundationFeatureFlag: vi.fn(),
  useFeaturePreferences: vi.fn(),
  useCreateBudgetGoal: vi.fn(),
  useLogBudgetSpend: vi.fn(),
  useAllocateWeeklySurplus: vi.fn(),
}))

vi.mock("@/hooks/use-budget-dashboard", () => ({
  useBudgetDashboard: mocks.useBudgetDashboard,
  useCreateBudgetGoal: mocks.useCreateBudgetGoal,
  useLogBudgetSpend: mocks.useLogBudgetSpend,
  useAllocateWeeklySurplus: mocks.useAllocateWeeklySurplus,
}))

vi.mock("@/hooks/use-feature-flag", () => ({
  useFoundationFeatureFlag: mocks.useFoundationFeatureFlag,
}))

vi.mock("@/hooks/use-feature-preferences", () => ({
  useFeaturePreferences: mocks.useFeaturePreferences,
}))

import BudgetPage from "@/app/budget/page"
import { BudgetSpendQuickAdd } from "@/components/budget/budget-spend-quick-add"
import { BudgetSourceBreakdown } from "@/components/budget/budget-source-breakdown"
import { BudgetWeeklyWrapCard } from "@/components/budget/budget-weekly-wrap-card"

describe("budget components", () => {
  it("renders disabled state on /budget when feature off", () => {
    mocks.useFoundationFeatureFlag.mockReturnValue({ isEnabled: false })
    mocks.useFeaturePreferences.mockReturnValue({ preferences: { budgetTrackingEnabled: true } })
    mocks.useBudgetDashboard.mockReturnValue({ isLoading: false, error: null, data: null })

    render(<BudgetPage />)
    expect(screen.getByText("Budget tracking is disabled")).toBeInTheDocument()
  })

  it("renders setup state when no active goal exists", () => {
    mocks.useFoundationFeatureFlag.mockReturnValue({ isEnabled: true })
    mocks.useFeaturePreferences.mockReturnValue({ preferences: { budgetTrackingEnabled: true } })
    mocks.useBudgetDashboard.mockReturnValue({
      isLoading: false,
      error: null,
      data: { dashboard: { featureState: { budgetTrackingEnabled: true }, activeGoal: null, completedGoal: null } },
    })
    mocks.useCreateBudgetGoal.mockReturnValue({ isPending: false, mutate: vi.fn() })

    render(<BudgetPage />)
    expect(screen.getByText("Start your first savings goal")).toBeInTheDocument()
  })

  it("shows source breakdown manual and receipt totals", () => {
    render(<BudgetSourceBreakdown summary={{ manual_spend_cents: 2500, receipt_spend_cents: 1500, tracked_spend_cents: 4000 }} />)
    expect(screen.getByText("manual: $25.00")).toBeInTheDocument()
    expect(screen.getByText("receipt: $15.00")).toBeInTheDocument()
    expect(screen.getByText("total: $40.00")).toBeInTheDocument()
  })

  it("quick add spend calls spend endpoint mutation", async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    mocks.useLogBudgetSpend.mockReturnValue({ isPending: false, mutate })

    render(<BudgetSpendQuickAdd />)
    await user.clear(screen.getByPlaceholderText("Amount (cents)"))
    await user.type(screen.getByPlaceholderText("Amount (cents)"), "2200")
    await user.click(screen.getByRole("button", { name: "Log spend" }))

    expect(mutate).toHaveBeenCalledWith({ amountCents: 2200, sourceType: "manual" })
  })

  it("shows neutral over-budget copy and disables allocate button when no surplus", async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    mocks.useAllocateWeeklySurplus.mockReturnValue({ isPending: false, mutate })

    render(
      <BudgetWeeklyWrapCard
        weekStartDate="2026-04-27"
        summary={{
          bankable_surplus_cents: 0,
          raw_surplus_cents: 0,
          weekly_budget_cents: 10000,
          tracked_spend_cents: 12000,
        }}
      />,
    )

    expect(screen.getByText(/No savings was moved/i)).toBeInTheDocument()
    const button = screen.getByRole("button", { name: "Bank surplus" })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(mutate).not.toHaveBeenCalled()
  })
})
