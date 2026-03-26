import { describe, it, expect, vi } from 'vitest'
import { parseJinaProductsWithFallbacks } from '../jina/product-parsing/pipeline'

describe('parseJinaProductsWithFallbacks', () => {
  it('returns empty array when crawledContent is falsy', async () => {
    const parseWithRegex = vi.fn()
    expect(await parseJinaProductsWithFallbacks({ crawledContent: null, parseWithRegex })).toEqual([])
    expect(await parseJinaProductsWithFallbacks({ crawledContent: '', parseWithRegex })).toEqual([])
    expect(parseWithRegex).not.toHaveBeenCalled()
  })

  it('returns regex products when no fallback blocks and products found', async () => {
    const products = [{ name: 'Milk', price: 3.99 }]
    const parseWithRegex = vi.fn().mockReturnValue({ products })

    const result = await parseJinaProductsWithFallbacks({
      crawledContent: '<html>...</html>',
      keyword: 'milk',
      parseWithRegex,
    })

    expect(result).toEqual(products)
    expect(parseWithRegex).toHaveBeenCalledWith('<html>...</html>', 'milk')
  })

  it('does not call LLM fallbacks when regex found products and no fallback blocks', async () => {
    const parseFallbackBlocksWithLLM = vi.fn()
    const parseFullPageWithLLM = vi.fn()

    await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'eggs',
      parseWithRegex: () => ({ products: [{ name: 'Eggs' }] }),
      parseFallbackBlocksWithLLM,
      parseFullPageWithLLM,
    })

    expect(parseFallbackBlocksWithLLM).not.toHaveBeenCalled()
    expect(parseFullPageWithLLM).not.toHaveBeenCalled()
  })

  it('calls parseFallbackBlocksWithLLM when fallback blocks exist', async () => {
    const fallbackProducts = [{ name: 'Bread' }]
    const parseFallbackBlocksWithLLM = vi.fn().mockResolvedValue(fallbackProducts)

    const result = await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'bread',
      parseWithRegex: () => ({
        products: [],
        llmFallbackBlocks: ['block1', 'block2'],
      }),
      parseFallbackBlocksWithLLM,
    })

    expect(parseFallbackBlocksWithLLM).toHaveBeenCalledWith(['block1', 'block2'], 'bread')
    expect(result).toEqual(fallbackProducts)
  })

  it('does not call parseFallbackBlocksWithLLM when fallback blocks array is empty', async () => {
    const parseFallbackBlocksWithLLM = vi.fn()

    await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'test',
      parseWithRegex: () => ({ products: [], llmFallbackBlocks: [] }),
      parseFallbackBlocksWithLLM,
    })

    expect(parseFallbackBlocksWithLLM).not.toHaveBeenCalled()
  })

  it('calls parseFullPageWithLLM when no products found and shouldTryFullPageLlm is not false', async () => {
    const fullPageProducts = [{ name: 'Butter' }]
    const parseFullPageWithLLM = vi.fn().mockResolvedValue(fullPageProducts)

    const result = await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'butter',
      parseWithRegex: () => ({ products: [] }),
      parseFullPageWithLLM,
    })

    expect(parseFullPageWithLLM).toHaveBeenCalledWith('content', 'butter')
    expect(result).toEqual(fullPageProducts)
  })

  it('does not call parseFullPageWithLLM when shouldTryFullPageLlm is false', async () => {
    const parseFullPageWithLLM = vi.fn()

    const result = await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'test',
      parseWithRegex: () => ({ products: [], shouldTryFullPageLlm: false }),
      parseFullPageWithLLM,
    })

    expect(parseFullPageWithLLM).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('does not call parseFullPageWithLLM when regex returned products', async () => {
    const parseFullPageWithLLM = vi.fn()

    await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'test',
      parseWithRegex: () => ({ products: [{ name: 'item' }] }),
      parseFullPageWithLLM,
    })

    expect(parseFullPageWithLLM).not.toHaveBeenCalled()
  })

  it('uses custom mergeProducts to combine regex and fallback products', async () => {
    const regexProducts = [{ name: 'A', source: 'regex' }]
    const llmProducts = [{ name: 'B', source: 'llm' }]
    const mergeProducts = vi.fn().mockReturnValue([...regexProducts, ...llmProducts])

    const result = await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'test',
      parseWithRegex: () => ({
        products: regexProducts,
        llmFallbackBlocks: ['block'],
      }),
      parseFallbackBlocksWithLLM: async () => llmProducts,
      mergeProducts,
    })

    expect(mergeProducts).toHaveBeenCalledWith(regexProducts, llmProducts, 'test')
    expect(result).toEqual([...regexProducts, ...llmProducts])
  })

  it('default mergeProducts concatenates regex and fallback products', async () => {
    const result = await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'test',
      parseWithRegex: () => ({
        products: [{ name: 'regex-item' }],
        llmFallbackBlocks: ['block'],
      }),
      parseFallbackBlocksWithLLM: async () => [{ name: 'llm-item' }],
    })

    expect(result).toEqual([{ name: 'regex-item' }, { name: 'llm-item' }])
  })

  it('skips LLM fallback blocks when parseFallbackBlocksWithLLM returns empty array', async () => {
    const parseFullPageWithLLM = vi.fn().mockResolvedValue([{ name: 'full-page' }])

    const result = await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'test',
      parseWithRegex: () => ({
        products: [],
        llmFallbackBlocks: ['block'],
      }),
      parseFallbackBlocksWithLLM: async () => [],
      parseFullPageWithLLM,
    })

    // Since fallback returned nothing and products still empty, should try full-page
    expect(parseFullPageWithLLM).toHaveBeenCalled()
    expect(result).toEqual([{ name: 'full-page' }])
  })

  it('returns empty array when parseFullPageWithLLM returns non-array', async () => {
    const result = await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'test',
      parseWithRegex: () => ({ products: [] }),
      parseFullPageWithLLM: async () => null,
    })

    expect(result).toEqual([])
  })

  it('handles parseWithRegex returning null gracefully', async () => {
    const result = await parseJinaProductsWithFallbacks({
      crawledContent: 'content',
      keyword: 'test',
      parseWithRegex: () => null,
    })

    expect(result).toEqual([])
  })
})
