import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRequire } from "module"

const _require = createRequire(import.meta.url)

const mockFetchJinaReader = vi.fn()

const patchCache = (id, exports) => {
  _require.cache[id] = { id, filename: id, loaded: true, exports }
}

patchCache(_require.resolve("../jina/client"), {
  fetchJinaReader: mockFetchJinaReader,
})

function loadModule() {
  delete _require.cache[_require.resolve("../jina/crawler")]
  return _require("../jina/crawler")
}

describe("createJinaCrawler shared cooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetchJinaReader.mockReset()
  })

  afterEach(() => {
    const { resetSharedCooldownState } = loadModule()
    resetSharedCooldownState()
    vi.useRealTimers()
  })

  it("shares cooldown across crawlers using the same scope", async () => {
    const { createJinaCrawler } = loadModule()
    const log = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const rateLimitError = Object.assign(new Error("Rate limited"), {
      response: { status: 429, headers: {} },
    })

    mockFetchJinaReader.mockRejectedValueOnce(rateLimitError)

    const sharedOptions = {
      log,
      withTimeout: (promise) => promise,
      enforceRateLimit: vi.fn(async () => undefined),
      buildSearchUrl: (keyword) => `https://example.com/search?q=${encodeURIComponent(keyword)}`,
      requestTimeoutMs: 100,
      maxRetries: 0,
      baseDelayMs: 0,
      min429RetryDelayMs: 50,
      cooldownMs: 1000,
      maxConsecutive429: 1,
      cooldownSleepCapMs: 0,
      cooldownScope: "shared-jina-scope",
    }

    const crawlerA = createJinaCrawler({
      ...sharedOptions,
      rateLimitErrorPrefix: "A_JINA",
      requestLabel: "aldi",
    })
    const crawlerB = createJinaCrawler({
      ...sharedOptions,
      rateLimitErrorPrefix: "B_JINA",
      requestLabel: "traderjoes",
    })

    await expect(crawlerA.crawl("milk", "94704")).rejects.toMatchObject({
      code: "A_JINA_COOLDOWN",
    })

    await expect(crawlerB.crawl("bread", "94704")).rejects.toMatchObject({
      code: "B_JINA_COOLDOWN",
    })

    expect(mockFetchJinaReader).toHaveBeenCalledTimes(1)
    expect(crawlerB.isCooldownActive()).toBe(true)
  })

  it("does not share cooldown across different scopes", async () => {
    const { createJinaCrawler } = loadModule()
    const log = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const rateLimitError = Object.assign(new Error("Rate limited"), {
      response: { status: 429, headers: {} },
    })

    mockFetchJinaReader
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ data: "ok" })

    const baseOptions = {
      log,
      withTimeout: (promise) => promise,
      enforceRateLimit: vi.fn(async () => undefined),
      buildSearchUrl: (keyword) => `https://example.com/search?q=${encodeURIComponent(keyword)}`,
      requestTimeoutMs: 100,
      maxRetries: 0,
      baseDelayMs: 0,
      min429RetryDelayMs: 50,
      cooldownMs: 1000,
      maxConsecutive429: 1,
      cooldownSleepCapMs: 0,
      rateLimitErrorPrefix: "JINA",
      requestLabel: "jina",
    }

    const crawlerA = createJinaCrawler({
      ...baseOptions,
      cooldownScope: "scope-a",
    })
    const crawlerB = createJinaCrawler({
      ...baseOptions,
      cooldownScope: "scope-b",
    })

    await expect(crawlerA.crawl("milk", "94704")).rejects.toMatchObject({
      code: "JINA_COOLDOWN",
    })

    await expect(crawlerB.crawl("bread", "94704")).resolves.toBe("ok")
    expect(mockFetchJinaReader).toHaveBeenCalledTimes(2)
  })
})
