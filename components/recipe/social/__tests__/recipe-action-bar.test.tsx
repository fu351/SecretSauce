import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RecipeActionBar } from "../recipe-action-bar"

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <div aria-label={alt} />,
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe("RecipeActionBar", () => {
  const onToggleFavorite = vi.fn()
  const onLikeToggle = vi.fn()
  const onRepostToggle = vi.fn()
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", fetchMock)
  })

  it("optimistically likes a recipe and then applies the server count", async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ likeCount: 11 }),
    })

    render(
      <RecipeActionBar
        recipeId="recipe_1"
        isFavorite={false}
        isTogglingFavorite={false}
        onToggleFavorite={onToggleFavorite}
        likeCount={3}
        isLiked={false}
        onLikeToggle={onLikeToggle}
        repostCount={2}
        isReposted={false}
        onRepostToggle={onRepostToggle}
        friendLikes={[]}
        isAuthenticated
        isDark={false}
      />
    )

    await user.click(screen.getByTitle("Like"))

    expect(onLikeToggle).toHaveBeenNthCalledWith(1, true, 4)
    await waitFor(() => {
      expect(onLikeToggle).toHaveBeenNthCalledWith(2, true, 11)
    })
    expect(fetchMock).toHaveBeenCalledWith("/api/recipes/recipe_1/likes", { method: "POST" })
  })

  it("reverts a repost when the API call fails", async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({
      ok: false,
      json: vi.fn(),
    })

    render(
      <RecipeActionBar
        recipeId="recipe_2"
        isFavorite={false}
        isTogglingFavorite={false}
        onToggleFavorite={onToggleFavorite}
        likeCount={0}
        isLiked={false}
        onLikeToggle={onLikeToggle}
        repostCount={2}
        isReposted={false}
        onRepostToggle={onRepostToggle}
        friendLikes={[]}
        isAuthenticated
        isDark
      />
    )

    await user.click(screen.getByTitle("Repost to your followers"))

    expect(onRepostToggle).toHaveBeenNthCalledWith(1, true, 3)
    await waitFor(() => {
      expect(onRepostToggle).toHaveBeenNthCalledWith(2, false, 2)
    })
  })

  it("copies the recipe link and renders social proof labels", async () => {
    const user = userEvent.setup()

    render(
      <RecipeActionBar
        recipeId="recipe_3"
        isFavorite={true}
        isTogglingFavorite={false}
        onToggleFavorite={onToggleFavorite}
        likeCount={3}
        isLiked={true}
        onLikeToggle={onLikeToggle}
        repostCount={1}
        isReposted={false}
        onRepostToggle={onRepostToggle}
        friendLikes={[
          { id: "friend_1", full_name: "Alice Baker", avatar_url: null, username: "alice" },
          { id: "friend_2", full_name: "Ben Cook", avatar_url: null, username: "ben" },
        ]}
        isAuthenticated
        isDark={false}
      />
    )

    expect(screen.getByText("Alice, Ben, and 1 other liked this")).toBeInTheDocument()

    await user.click(screen.getByTitle("Copy link"))

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument()
    })
  })
})
