import { describe, it, expect, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../../test/mocks/server'
import {
  DEFAULT_OPENAI_API_KEY_PLACEHOLDER,
  getOpenAIApiKey,
  hasConfiguredOpenAIKey,
  stripMarkdownCodeFences,
  parseJsonFromLlmText,
  requestOpenAIJson,
} from '../llm-fallback'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

function mockOpenAI(responseBody) {
  server.use(
    http.post(OPENAI_URL, () => HttpResponse.json(responseBody))
  )
}

afterEach(() => {
  delete process.env.OPENAI_API_KEY
})

describe('getOpenAIApiKey', () => {
  it('returns placeholder when OPENAI_API_KEY is not set', () => {
    delete process.env.OPENAI_API_KEY
    expect(getOpenAIApiKey()).toBe(DEFAULT_OPENAI_API_KEY_PLACEHOLDER)
  })

  it('returns the value of OPENAI_API_KEY when set', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key'
    expect(getOpenAIApiKey()).toBe('sk-test-key')
  })
})

describe('hasConfiguredOpenAIKey', () => {
  it('returns false for the placeholder key', () => {
    expect(hasConfiguredOpenAIKey(DEFAULT_OPENAI_API_KEY_PLACEHOLDER)).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(hasConfiguredOpenAIKey('')).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(hasConfiguredOpenAIKey(null)).toBe(false)
    expect(hasConfiguredOpenAIKey(undefined)).toBe(false)
  })

  it('returns true for a real-looking API key', () => {
    expect(hasConfiguredOpenAIKey('sk-proj-abc123')).toBe(true)
  })

  it('returns false for a key containing the placeholder string', () => {
    expect(hasConfiguredOpenAIKey(`prefix_${DEFAULT_OPENAI_API_KEY_PLACEHOLDER}_suffix`)).toBe(false)
  })
})

describe('stripMarkdownCodeFences', () => {
  it('strips leading ```json fence and trailing ``` fence', () => {
    const input = '```json\n{"key": "value"}\n```'
    expect(stripMarkdownCodeFences(input)).toBe('{"key": "value"}')
  })

  it('strips fences case-insensitively', () => {
    const input = '```JSON\n{"key": "value"}\n```'
    expect(stripMarkdownCodeFences(input)).toBe('{"key": "value"}')
  })

  it('returns plain text unchanged', () => {
    expect(stripMarkdownCodeFences('{"key": "value"}')).toBe('{"key": "value"}')
  })

  it('returns empty string for empty input', () => {
    expect(stripMarkdownCodeFences('')).toBe('')
  })

  it('handles null/undefined gracefully', () => {
    expect(stripMarkdownCodeFences(null)).toBe('')
    expect(stripMarkdownCodeFences(undefined)).toBe('')
  })

  it('trims surrounding whitespace', () => {
    expect(stripMarkdownCodeFences('  {"key": 1}  ')).toBe('{"key": 1}')
  })

  it('strips fences without newline after opening', () => {
    const input = '```json{"key": "value"}```'
    expect(stripMarkdownCodeFences(input)).toBe('{"key": "value"}')
  })
})

describe('parseJsonFromLlmText', () => {
  it('parses valid JSON', () => {
    expect(parseJsonFromLlmText('{"name": "milk", "price": 3.99}')).toEqual({
      name: 'milk',
      price: 3.99,
    })
  })

  it('parses JSON wrapped in markdown fences', () => {
    const input = '```json\n[{"name": "eggs"}]\n```'
    expect(parseJsonFromLlmText(input)).toEqual([{ name: 'eggs' }])
  })

  it('returns null for empty string', () => {
    expect(parseJsonFromLlmText('')).toBeNull()
  })

  it('throws on invalid JSON', () => {
    expect(() => parseJsonFromLlmText('not json')).toThrow()
  })
})

describe('requestOpenAIJson', () => {
  it('throws when prompt is missing', async () => {
    await expect(requestOpenAIJson({ openAiApiKey: 'sk-valid' })).rejects.toThrow(
      'Missing prompt'
    )
  })

  it('throws when prompt is blank', async () => {
    await expect(
      requestOpenAIJson({ prompt: '   ', openAiApiKey: 'sk-valid' })
    ).rejects.toThrow('Missing prompt')
  })

  it('throws OPENAI_API_KEY_NOT_CONFIGURED when key is the placeholder', async () => {
    await expect(
      requestOpenAIJson({ prompt: 'list products', openAiApiKey: DEFAULT_OPENAI_API_KEY_PLACEHOLDER })
    ).rejects.toThrow('OPENAI_API_KEY_NOT_CONFIGURED')
  })

  it('returns parsed JSON from the response', async () => {
    mockOpenAI({ choices: [{ message: { content: '{"items": [1, 2, 3]}' } }] })
    const result = await requestOpenAIJson({ prompt: 'test', openAiApiKey: 'sk-real' })
    expect(result).toEqual({ items: [1, 2, 3] })
  })

  it('parses JSON wrapped in markdown code fences', async () => {
    mockOpenAI({ choices: [{ message: { content: '```json\n{"ok": true}\n```' } }] })
    const result = await requestOpenAIJson({ prompt: 'test', openAiApiKey: 'sk-real' })
    expect(result).toEqual({ ok: true })
  })

  it('returns null when response content is empty', async () => {
    mockOpenAI({ choices: [{ message: { content: '' } }] })
    const result = await requestOpenAIJson({ prompt: 'test', openAiApiKey: 'sk-real' })
    expect(result).toBeNull()
  })

  it('returns null when choices array is missing', async () => {
    mockOpenAI({})
    const result = await requestOpenAIJson({ prompt: 'test', openAiApiKey: 'sk-real' })
    expect(result).toBeNull()
  })
})
