
import { BaseTable } from './base-db'
import type { Database } from '@/lib/database/supabase'

type StoreLocationCacheRow = Database['public']['Tables']['store_locations_cache']['Row']
type StoreLocationCacheInsert = Database['public']['Tables']['store_locations_cache']['Insert']
type StoreLocationCacheUpdate = Database['public']['Tables']['store_locations_cache']['Update']

class StoreLocationsCacheTable extends BaseTable<
  'store_locations_cache',
  StoreLocationCacheRow,
  StoreLocationCacheInsert,
  StoreLocationCacheUpdate
> {
  private static instance: StoreLocationsCacheTable
  readonly tableName = 'store_locations_cache' as const

  private constructor() {
    super()
  }

  static getInstance(): StoreLocationsCacheTable {
    if (!StoreLocationsCacheTable.instance) {
      StoreLocationsCacheTable.instance = new StoreLocationsCacheTable()
    }
    return StoreLocationsCacheTable.instance
  }

  /**
   * Find cached location for a store near postal code
   */
  async findByStoreAndPostalCode(
    storeCanonical: string,
    postalCode: string
  ): Promise<StoreLocationCacheRow | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('store_canonical', storeCanonical)
        .eq('postal_code', postalCode)
        .single()

      if (error) {
        this.handleError(error, 'findByStoreAndPostalCode')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'findByStoreAndPostalCode')
      return null
    }
  }

  /**
   * Find all cached locations for a store
   */
  async findByStore(storeCanonical: string): Promise<StoreLocationCacheRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('store_canonical', storeCanonical)
        .order('updated_at', { ascending: false })

      if (error) {
        this.handleError(error, 'findByStore')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findByStore')
      return []
    }
  }

  /**
   * Find stores near coordinates (within radius)
   * Uses Haversine distance calculation
   */
  async findNearCoordinates(
    lat: number,
    lng: number,
    radiusMiles: number
  ): Promise<StoreLocationCacheRow[]> {
    try {
      console.log(`[StoreLocationsCacheTable] Finding stores within ${radiusMiles} miles of (${lat}, ${lng})`)

      // Fetch all locations (we'll filter in memory for simplicity)
      // For production, consider using PostGIS or a stored procedure
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')

      if (error) {
        this.handleError(error, 'findNearCoordinates')
        return []
      }

      if (!data) return []

      // Filter by distance using Haversine formula
      const filtered = data.filter(location => {
        const distance = this.calculateDistance(lat, lng, location.lat, location.lng)
        return distance <= radiusMiles
      })

      // Sort by distance
      filtered.sort((a, b) => {
        const distA = this.calculateDistance(lat, lng, a.lat, a.lng)
        const distB = this.calculateDistance(lat, lng, b.lat, b.lng)
        return distA - distB
      })

      return filtered
    } catch (error) {
      this.handleError(error, 'findNearCoordinates')
      return []
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in miles
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959 // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1)
    const dLng = this.toRadians(lng2 - lng1)

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
  }

  /**
   * Cache a store location (upsert)
   * Upserts on (store_canonical, postal_code) conflict
   */
  async cacheLocation(
    storeCanonical: string,
    postalCode: string,
    lat: number,
    lng: number,
    formattedAddress?: string | null,
    matchedName?: string | null
  ): Promise<StoreLocationCacheRow | null> {
    try {
      console.log(`[StoreLocationsCacheTable] Caching location for ${storeCanonical} at ${postalCode}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .upsert(
          {
            store_canonical: storeCanonical,
            postal_code: postalCode,
            lat,
            lng,
            formatted_address: formattedAddress || null,
            matched_name: matchedName || null,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'store_canonical,postal_code'
          }
        )
        .select()
        .single()

      if (error) {
        this.handleError(error, 'cacheLocation')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'cacheLocation')
      return null
    }
  }

  /**
   * Batch cache multiple store locations
   * Single upsert for efficiency
   */
  async batchCacheLocations(
    locations: Array<{
      storeCanonical: string
      postalCode: string
      lat: number
      lng: number
      formattedAddress?: string | null
      matchedName?: string | null
    }>
  ): Promise<number> {
    try {
      if (locations.length === 0) return 0

      console.log(`[StoreLocationsCacheTable] Batch caching ${locations.length} locations`)

      const insertData = locations.map(loc => ({
        store_canonical: loc.storeCanonical,
        postal_code: loc.postalCode,
        lat: loc.lat,
        lng: loc.lng,
        formatted_address: loc.formattedAddress || null,
        matched_name: loc.matchedName || null,
        updated_at: new Date().toISOString()
      }))

      const { data, error } = await this.supabase
        .from(this.tableName)
        .upsert(insertData, {
          onConflict: 'store_canonical,postal_code'
        })
        .select()

      if (error) {
        this.handleError(error, 'batchCacheLocations')
        return 0
      }

      return data?.length || 0
    } catch (error) {
      this.handleError(error, 'batchCacheLocations')
      return 0
    }
  }

  /**
   * Get all cached stores for a postal code
   * Used for store comparison
   */
  async findByPostalCode(postalCode: string): Promise<StoreLocationCacheRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('postal_code', postalCode)
        .order('store_canonical', { ascending: true })

      if (error) {
        this.handleError(error, 'findByPostalCode')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findByPostalCode')
      return []
    }
  }

  /**
   * Clean up stale cache entries (older than N days)
   */
  async cleanupStale(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      console.log(`[StoreLocationsCacheTable] Cleaning up entries older than ${cutoffDate.toISOString()}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .delete()
        .lt('updated_at', cutoffDate.toISOString())
        .select()

      if (error) {
        this.handleError(error, 'cleanupStale')
        return 0
      }

      return data?.length || 0
    } catch (error) {
      this.handleError(error, 'cleanupStale')
      return 0
    }
  }

  /**
   * Check if location is cached and fresh
   */
  async isCached(
    storeCanonical: string,
    postalCode: string,
    maxAgeDays: number = 30
  ): Promise<boolean> {
    try {
      const location = await this.findByStoreAndPostalCode(storeCanonical, postalCode)
      if (!location) return false

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays)

      const updatedAt = new Date(location.updated_at)
      return updatedAt > cutoffDate
    } catch (error) {
      this.handleError(error, 'isCached')
      return false
    }
  }
}

export const storeLocationsCacheDB = StoreLocationsCacheTable.getInstance()
