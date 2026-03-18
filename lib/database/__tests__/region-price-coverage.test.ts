// @vitest-environment node
/**
 * Integration tests: verify that price data exists for zip codes belonging
 * to profiles in the nightly scraper region.
 *
 * Region is defined by .github/workflows/config/pipeline-defaults.json:
 *   nightly_workflow.scraper_state  (e.g. "CA")
 *   nightly_workflow.scraper_cities_csv  (e.g. "Berkeley,Oakland,…")
 *
 * Data model:
 *   profiles.zip_code           — user's zip
 *   scraped_zipcodes            — canonical record of which zips were scraped
 *   grocery_stores.zip_code     — store location
 *   ingredients_recent.grocery_store_id → grocery_stores.id  — price rows
 *
 * Runs in Node environment so the Supabase service-role key is accepted
 * and MSW browser intercepts are bypassed.
 */

import 'dotenv/config'
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database/supabase'
import pipelineDefaults from '../../../.github/workflows/config/pipeline-defaults.json'

// ---------------------------------------------------------------------------
// Region config — sourced directly from the nightly workflow defaults
// ---------------------------------------------------------------------------

const { scraper_state, scraper_cities_csv } = pipelineDefaults.nightly_workflow
const CONFIGURED_CITIES = new Set(
  scraper_cities_csv.split(',').map((c) => c.trim()).filter(Boolean)
)

const SAMPLE_SIZE = 10

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function buildServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — ' +
        'add them to .env to run region-price-coverage tests.'
    )
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// scraped_zipcodes is not in the generated Database type — queries use `as any` casts inline

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Region Price Coverage (real DB)', () => {
  let supabase: SupabaseClient<Database>

  beforeAll(() => {
    supabase = buildServiceClient()
  })

  // -------------------------------------------------------------------------
  // 1. Profiles in the region have zip codes set
  // -------------------------------------------------------------------------

  it(`profiles with state=${scraper_state} have a non-null zip_code`, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, zip_code, city, state')
      .eq('state', scraper_state)
      .not('zip_code', 'is', null)
      .limit(SAMPLE_SIZE)

    expect(error, error?.message).toBeNull()
    expect(data!.length, `No CA profiles with a zip_code found`).toBeGreaterThan(0)

    for (const profile of data!) {
      expect(profile.zip_code).toBeTruthy()
      expect(profile.state).toBe(scraper_state)
    }
  })

  // -------------------------------------------------------------------------
  // 2. Profile zip codes appear in scraped_zipcodes
  //    (confirms the scraper has actually run for the user's location)
  // -------------------------------------------------------------------------

  it(`profile zip codes from state=${scraper_state} exist in scraped_zipcodes`, async () => {
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('zip_code')
      .eq('state', scraper_state)
      .not('zip_code', 'is', null)
      .limit(SAMPLE_SIZE)

    expect(profileErr, profileErr?.message).toBeNull()

    const zips = [...new Set(profiles!.map((p) => p.zip_code).filter(Boolean))] as string[]
    expect(zips.length, 'No unique zip codes found in CA profiles').toBeGreaterThan(0)

    const { data: scraped, error: scrapedErr } = await supabase
      .from('scraped_zipcodes' as any)
      .select('zip_code')
      .in('zip_code', zips)

    expect(scrapedErr, scrapedErr?.message).toBeNull()

    const scrapedSet = new Set((scraped ?? []).map((r: any) => r.zip_code))
    const unscraped = zips.filter((z) => !scrapedSet.has(z))

    expect(
      unscraped,
      `Profile zip codes not found in scraped_zipcodes (scraper has never run there):\n` +
        unscraped.map((z) => `  ${z}`).join('\n')
    ).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // 3. scraped_zipcodes for the configured cities belong to scraper_state
  // -------------------------------------------------------------------------

  it(`scraped_zipcodes for the configured cities are all in state=${scraper_state}`, async () => {
    const { data, error } = await supabase
      .from('scraped_zipcodes' as any)
      .select('zip_code, city, state')
      .in('city', [...CONFIGURED_CITIES])
      .limit(SAMPLE_SIZE)

    expect(error, error?.message).toBeNull()
    expect(data!.length, `No scraped_zipcodes rows found for the configured Bay Area cities`).toBeGreaterThan(0)

    const wrongState = (data ?? []).filter((r: any) => r.state !== scraper_state)
    expect(
      wrongState,
      `scraped_zipcodes rows outside state=${scraper_state}:\n` +
        wrongState.map((r: any) => `  city=${r.city} zip=${r.zip_code} state=${r.state}`).join('\n')
    ).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // 4. Grocery stores exist for zip codes in the scraper region
  // -------------------------------------------------------------------------

  it(`grocery_stores exist for zip codes in the ${scraper_state} scraper region`, async () => {
    const { data: scrapedZips, error: scrapedErr } = await supabase
      .from('scraped_zipcodes' as any)
      .select('zip_code')
      .in('city', [...CONFIGURED_CITIES])
      .limit(SAMPLE_SIZE)

    expect(scrapedErr, scrapedErr?.message).toBeNull()

    const zips = (scrapedZips ?? []).map((r: any) => r.zip_code) as string[]
    expect(zips.length, 'No scraped zip codes found for configured cities').toBeGreaterThan(0)

    const { data: stores, error: storeErr } = await supabase
      .from('grocery_stores')
      .select('id, zip_code, store_enum, is_active')
      .in('zip_code', zips)
      .eq('is_active', true)
      .limit(1)

    expect(storeErr, storeErr?.message).toBeNull()
    expect(
      stores!.length,
      `No active grocery_stores found for any scraped zip code in [${zips.slice(0, 5).join(', ')}…]`
    ).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // 5. ingredients_recent has at least one price row somewhere in the region
  //    (join path: ingredients_recent.grocery_store_id → grocery_stores.zip_code)
  //    Also reports per-zip coverage so gaps are visible in CI output.
  // -------------------------------------------------------------------------

  it(`ingredients_recent has price data for at least one store in the ${scraper_state} scraper region`, async () => {
    // Collect zip codes that have been scraped for the configured cities
    const { data: scrapedZips, error: zipErr } = await supabase
      .from('scraped_zipcodes' as any)
      .select('zip_code')
      .in('city', [...CONFIGURED_CITIES])
      .limit(50)

    expect(zipErr, zipErr?.message).toBeNull()
    const zips = (scrapedZips ?? []).map((r: any) => r.zip_code) as string[]
    expect(zips.length, 'No scraped zip codes found for configured cities').toBeGreaterThan(0)

    // Get active stores in those zips
    // Cast through any: geom: unknown | null in grocery_stores breaks query-builder type inference
    type StoreRow = { id: string; zip_code: string | null; store_enum: string }
    const { data: storesRaw, error: storeErr } = await (supabase as any)
      .from('grocery_stores')
      .select('id, zip_code, store_enum')
      .in('zip_code', zips)
      .eq('is_active', true)
    const stores = (storesRaw ?? []) as StoreRow[]

    expect(storeErr, storeErr?.message).toBeNull()
    expect(stores.length, `No active stores in scraped region zips`).toBeGreaterThan(0)

    // Check each store for at least one price row in ingredients_recent
    const coverage = await Promise.all(
      stores.map(async (store) => {
        const { data, error } = await (supabase as any)
          .from('ingredients_recent')
          .select('price')
          .eq('grocery_store_id', store.id)
          .gt('price', 0)
          .limit(1)

        return {
          storeId: store.id,
          zip: store.zip_code,
          brand: store.store_enum,
          hasPrices: !error && Array.isArray(data) && data.length > 0,
        }
      })
    )

    const withPrices = coverage.filter((r) => r.hasPrices)
    const missing = coverage.filter((r) => !r.hasPrices)

    // Log coverage summary so gaps are visible even when the test passes
    console.info(
      `[region-price-coverage] ${scraper_state} price coverage: ` +
        `${withPrices.length}/${coverage.length} stores have prices in ingredients_recent\n` +
        (missing.length
          ? `  Missing: ` + missing.map((r) => `${r.brand}@${r.zip}`).join(', ')
          : `  All stores covered`)
    )

    expect(
      withPrices.length,
      `No store in the ${scraper_state} scraper region has any price data in ingredients_recent.\n` +
        `Checked ${stores.length} active stores across zips: ${zips.slice(0, 5).join(', ')}…\n` +
        `Run the nightly scraper for state=${scraper_state} to populate prices.`
    ).toBeGreaterThan(0)
  })
})
