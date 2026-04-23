export interface ProfilePagedResult<T> {
  items: T[]
  hasMore: boolean
}

export interface ProfileCollectionSummary {
  id: string
  name: string
  is_default: boolean
  recipe_count: number
}
