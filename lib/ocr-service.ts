import { createWorker, Worker } from 'tesseract.js'
import type { OCRResult } from '@/lib/types'

let worker: Worker | null = null

/**
 * Initialize Tesseract.js worker
 * This is done lazily to avoid loading the large WASM files until needed
 */
async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // Progress updates can be used to show loading state
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`)
        }
      },
    })
  }
  return worker
}

/**
 * Perform OCR on an image file
 * @param imageFile - The image file to process
 * @param onProgress - Optional callback for progress updates (0-100)
 * @returns OCR result with extracted text and confidence
 */
export async function performOCR(
  imageFile: File,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  try {
    // Create a worker with progress tracking
    const ocrWorker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100))
        }
      },
    })

    // Convert file to image URL
    const imageUrl = URL.createObjectURL(imageFile)

    // Perform OCR
    const { data } = await ocrWorker.recognize(imageUrl)

    // Clean up
    URL.revokeObjectURL(imageUrl)
    await ocrWorker.terminate()

    // Extract blocks with confidence scores
    const blocks = data.blocks?.map((block) => ({
      text: block.text,
      confidence: block.confidence,
      bbox: block.bbox ? {
        x: block.bbox.x0,
        y: block.bbox.y0,
        width: block.bbox.x1 - block.bbox.x0,
        height: block.bbox.y1 - block.bbox.y0,
      } : undefined,
    })) || []

    return {
      text: data.text,
      confidence: data.confidence,
      blocks,
    }
  } catch (error) {
    console.error('OCR error:', error)
    throw new Error(
      error instanceof Error
        ? `OCR failed: ${error.message}`
        : 'Failed to perform OCR on image'
    )
  }
}

/**
 * Perform OCR on an image from a URL
 * @param imageUrl - URL of the image to process
 * @param onProgress - Optional callback for progress updates (0-100)
 * @returns OCR result with extracted text and confidence
 */
export async function performOCRFromUrl(
  imageUrl: string,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  try {
    const ocrWorker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100))
        }
      },
    })

    const { data } = await ocrWorker.recognize(imageUrl)

    await ocrWorker.terminate()

    return {
      text: data.text,
      confidence: data.confidence,
      blocks: data.blocks?.map((block) => ({
        text: block.text,
        confidence: block.confidence,
      })) || [],
    }
  } catch (error) {
    console.error('OCR error:', error)
    throw new Error(
      error instanceof Error
        ? `OCR failed: ${error.message}`
        : 'Failed to perform OCR on image'
    )
  }
}

/**
 * Clean up OCR text to remove common artifacts
 */
export function cleanOCRText(text: string): string {
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Fix common OCR mistakes
    .replace(/\|/g, 'l')
    .replace(/0(?=[a-zA-Z])/g, 'O')
    // Remove isolated single characters that are likely noise
    .replace(/\s[a-zA-Z]\s/g, ' ')
    // Normalize line breaks
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

/**
 * Terminate the shared worker if it exists
 * Call this when the component unmounts or OCR is no longer needed
 */
export async function terminateOCRWorker(): Promise<void> {
  if (worker) {
    await worker.terminate()
    worker = null
  }
}
