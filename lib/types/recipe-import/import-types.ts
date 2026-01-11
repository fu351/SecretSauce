/**
 * OCR Processing Result Type
 *
 * Result from optical character recognition (OCR) processing of recipe images.
 * Contains extracted text with confidence scores and optional block-level details.
 */
export interface OCRResult {
  text: string
  confidence: number
  blocks?: Array<{
    text: string
    confidence: number
    bbox?: { x: number; y: number; width: number; height: number }
  }>
}

/**
 * Instagram Post Data Type
 *
 * Data extracted from an Instagram post that may contain recipe information.
 * Includes post content, image URL, and metadata.
 */
export interface InstagramPostData {
  caption: string
  image_url: string
  username?: string
  post_url: string
  timestamp?: string
}
