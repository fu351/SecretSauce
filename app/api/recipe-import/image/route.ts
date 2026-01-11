import { NextRequest, NextResponse } from 'next/server'
import type { RecipeImportResponse } from '@/lib/types'

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: 'OCR text is too short or empty' } as RecipeImportResponse,
        { status: 400 }
      )
    }

    if (!PYTHON_SERVICE_URL) {
      return NextResponse.json(
        { success: false, error: 'Python service URL not configured' } as RecipeImportResponse,
        { status: 500 }
      )
    }

    // Call Python backend to parse the OCR text
    const response = await fetch(`${PYTHON_SERVICE_URL}recipe-import/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        source_type: 'image'
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { success: false, error: `Backend error: ${errorText}` } as RecipeImportResponse,
        { status: response.status }
      )
    }

    const data: RecipeImportResponse = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('Image import error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse recipe from image'
      } as RecipeImportResponse,
      { status: 500 }
    )
  }
}
