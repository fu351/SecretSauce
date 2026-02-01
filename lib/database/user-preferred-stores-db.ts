import { BaseTable } from './base-db'
import type { Database } from '@/lib/database/supabase'

type GroceryStoreEnum = Database['public']['Enums']['grocery_store']
type UserPreferredStoreRow = Database['public']['Tables']['user_preferred_stores']['Row']
type UserPreferredStoreInsert = Database['public']['Tables']['user_preferred_stores']['Insert']
type UserPreferredStoreUpdate = Database['public']['Tables']['user_preferred_stores']['Update']
type ClosestStoreResult = Database['public']['Functions']['get_closest_stores']['Returns']

class UserPreferredStoresTable extends BaseTable<
  'user_preferred_stores',
  UserPreferredStoreRow,
  UserPreferredStoreInsert,
  UserPreferredStoreUpdate
> {
  private static instance: UserPreferredStoresTable | null = null
  readonly tableName = 'user_preferred_stores' as const

  private constructor() {
    super()
  }

  static getInstance(): UserPreferredStoresTable {
    if (!UserPreferredStoresTable.instance) {
      UserPreferredStoresTable.instance = new UserPreferredStoresTable()
    }
    return UserPreferredStoresTable.instance
  }

  async fetchForProfile(profileId: string): Promise<UserPreferredStoreRow[]> {
    if (!profileId) return []

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('profile_id', profileId)
      .order('distance_miles', { ascending: true })

    if (error) {
      this.handleError(error, 'fetchForProfile')
      return []
    }

    return data || []
  }

  async fetchPreference(
    profileId: string,
    storeEnum: GroceryStoreEnum
  ): Promise<UserPreferredStoreRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('profile_id', profileId)
      .eq('store_enum', storeEnum)
      .maybeSingle()

    if (error) {
      this.handleError(error, 'fetchPreference')
      return null
    }

    return data || null
  }

  async upsertPreference(entry: UserPreferredStoreInsert): Promise<UserPreferredStoreRow | null> {
    const payload: UserPreferredStoreInsert = {
      ...entry,
      updated_at: entry.updated_at || new Date().toISOString(),
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .upsert(payload, { onConflict: 'profile_id,store_enum' })
      .select('*')
      .maybeSingle()

    if (error) {
      this.handleError(error, 'upsertPreference')
      return null
    }

    return data || null
  }

  async updateDistance(
    profileId: string,
    storeEnum: GroceryStoreEnum,
    distanceMiles: number | null
  ): Promise<UserPreferredStoreRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({ distance_miles: distanceMiles, updated_at: new Date().toISOString() } as UserPreferredStoreUpdate)
      .eq('profile_id', profileId)
      .eq('store_enum', storeEnum)
      .select('*')
      .maybeSingle()

    if (error) {
      this.handleError(error, 'updateDistance')
      return null
    }

    return data || null
  }

  async removePreference(profileId: string, storeEnum: GroceryStoreEnum): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('profile_id', profileId)
      .eq('store_enum', storeEnum)

    if (error) {
      this.handleError(error, 'removePreference')
      return false
    }

    return true
  }

  async getClosestStoresForUser(profileId: string): Promise<ClosestStoreResult> {
    if (!profileId) return []

    const { data, error } = await this.supabase.rpc('get_closest_stores', { user_id: profileId })

    if (error) {
      this.handleError(error, 'getClosestStoresForUser')
      return []
    }

    return Array.isArray(data) ? (data as ClosestStoreResult) : []
  }
}

export const userPreferredStoresDB = UserPreferredStoresTable.getInstance()
