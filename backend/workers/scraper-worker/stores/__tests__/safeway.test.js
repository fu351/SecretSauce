// @vitest-environment node
import { vi, describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

const patchCache = (id, exports) => {
  _require.cache[id] = { id, filename: id, loaded: true, exports }
}

// playwright-core and @sparticuz/chromium are required at module load time
// but only used in the (currently disabled) real implementation
patchCache(_require.resolve('playwright-core'), {
  chromium: { launch: vi.fn() },
})
patchCache(_require.resolve('@sparticuz/chromium'), {
  args: [],
  executablePath: vi.fn(() => Promise.resolve('/usr/bin/chromium')),
  headless: true,
})
patchCache(_require.resolve('../../utils/logger'), {
  createScraperLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
})
patchCache(_require.resolve('../../utils/runtime-config'), {
  withScraperTimeout: (promise) => promise,
})
patchCache(_require.resolve('../../utils/jina/llm-fallback'), {
  getOpenAIApiKey: () => 'sk-test',
  hasConfiguredOpenAIKey: () => true,
  requestOpenAIJson: vi.fn(),
})

delete _require.cache[_require.resolve('../safeway.js')]
const { searchSafeway } = _require('../safeway.js')

describe('searchSafeway', () => {
  it('always returns [] (dummy scraper)', async () => {
    const results = await searchSafeway('milk', '94704')
    expect(results).toEqual([])
  })

  it('returns [] for any keyword/zip combination', async () => {
    const results = await searchSafeway('pasta', '98101')
    expect(results).toEqual([])
  })
})
