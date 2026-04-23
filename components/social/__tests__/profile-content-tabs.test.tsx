import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/social/user-post-grid", () => ({
  UserPostGrid: ({ canViewContent }: { canViewContent: boolean }) => (
    <div>{canViewContent ? "Posts panel" : "Posts private"}</div>
  ),
}))

vi.mock("@/components/social/user-recipe-grid", () => ({
  UserRecipeGrid: ({ canViewContent }: { canViewContent: boolean }) => (
    <div>{canViewContent ? "Recipes panel" : "Recipes private"}</div>
  ),
}))

vi.mock("@/components/social/profile-collections-grid", () => ({
  ProfileCollectionsGrid: ({ canViewContent }: { canViewContent: boolean }) => (
    <div>{canViewContent ? "Collections panel" : "Collections private"}</div>
  ),
}))

describe("ProfileContentTabs", () => {
  it("renders and switches tabs", async () => {
    const user = userEvent.setup()
    const { ProfileContentTabs } = await import("../profile-content-tabs")

    render(
      <ProfileContentTabs username="avery" isOwnProfile={false} canViewContent={true} />
    )

    expect(screen.getByText("Posts panel")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: /recipes/i }))
    expect(screen.getByText("Recipes panel")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: /collections/i }))
    expect(screen.getByText("Collections panel")).toBeInTheDocument()
  })
})
