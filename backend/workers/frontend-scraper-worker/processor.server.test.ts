import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}))

vi.mock("../scraper-worker/ingredient-pipeline", () => ({
  getOrRefreshIngredientPricesForStores: vi.fn(),
}))

vi.mock("../../../lib/database/supabase-server", () => ({
  createAnonSupabaseClient: vi.fn(),
  createUserSupabaseClient: vi.fn(),
}))

vi.mock("../../../lib/database/ingredients-db", () => ({
  normalizeStoreName: (store: string) =>
    store.toLowerCase().replace(/\s+/g, "").replace(/[']/g, "").trim(),
  ingredientsRecentDB: {
    findByStandardizedId: vi.fn(),
  },
  ingredientsHistoryDB: {
    batchInsertPrices: vi.fn(),
  },
}))

vi.mock("../../../lib/database/profile-db", () => ({
  profileDB: {
    fetchProfileFields: vi.fn(),
  },
}))

vi.mock("@/lib/store/user-preferred-stores", () => ({
  getUserPreferredStores: vi.fn(),
}))

import { runDirectFallbackStoreScraper } from "./processor"

describe("runDirectFallbackStoreScraper", () => {
  const scraper = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    scraper.mockResolvedValue([])
  })

  it("passes preferred Target metadata through to the Target scraper", async () => {
    const preferredTargetStore = {
      id: "db-store-id",
      storeId: "target-store-id",
      grocery_store_id: "grocery-store-id",
      zip_code: "94103",
    }

    await runDirectFallbackStoreScraper(
      "target",
      scraper,
      "milk",
      "94103",
      preferredTargetStore as any,
    )

    expect(scraper).toHaveBeenCalledWith("milk", preferredTargetStore, "94103")
  })
})
