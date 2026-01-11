import { NextRequest, NextResponse } from 'next/server'
import type { RecipeImportResponse } from '@/lib/types'

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'Instagram URL is required' } as RecipeImportResponse,
        { status: 400 }
      )
    }

    // Validate Instagram URL
    if (!url.includes('instagram.com')) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid Instagram URL' } as RecipeImportResponse,
        { status: 400 }
      )
    }

    if (!PYTHON_SERVICE_URL) {
      return NextResponse.json(
        { success: false, error: 'Python service URL not configured' } as RecipeImportResponse,
        { status: 500 }
      )
    }

    // Call Python backend
    const response = await fetch(`${PYTHON_SERVICE_URL}recipe-import/instagram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
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
    console.error('Instagram import error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import recipe from Instagram'
      } as RecipeImportResponse,
      { status: 500 }
    )
  }
}
