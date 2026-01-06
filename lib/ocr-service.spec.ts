import { describe, it, expect } from 'vitest'
import { cleanOCRText } from './ocr-service'

describe('cleanOCRText', () => {
  it('normalizes whitespace and common OCR artifacts', () => {
    const input = 'Line 1\n\nLine 2  | 0range  X'
    const output = cleanOCRText(input)
    expect(output).toBe('Line 1 Line 2 Orange X')
  })
})
