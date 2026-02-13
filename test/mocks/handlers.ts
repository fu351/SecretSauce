import { http, HttpResponse } from 'msw'

export const handlers = [
  // API route mocks
  http.post('/api/ingredients/standardize', () => {
    return HttpResponse.json({
      context: 'recipe',
      standardized: [
        {
          id: '1',
          originalName: 'chopped onion',
          canonicalName: 'onion',
          category: 'produce',
          confidence: 0.95,
        },
      ],
    })
  }),

  // Google Maps API mock
  http.post('/api/maps', async ({ request }) => {
    const body = await request.json()
    const { action } = body as any

    if (action === 'geocode') {
      return HttpResponse.json({
        status: 'OK',
        results: [
          {
            geometry: {
              location: { lat: 37.7749, lng: -122.4194 },
            },
            formatted_address: '123 Main St, San Francisco, CA 94102',
          },
        ],
      })
    }

    return HttpResponse.json({ status: 'ZERO_RESULTS', results: [] })
  }),
]
