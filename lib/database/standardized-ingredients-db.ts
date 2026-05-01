import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"

type StandardizedIngredientRow = Database["public"]["Tables"]["standardized_ingredients"]["Row"]
type StandardizedIngredientInsert = Database["public"]["Tables"]["standardized_ingredients"]["Insert"]
type StandardizedIngredientUpdate = Database["public"]["Tables"]["standardized_ingredients"]["Update"]
type ItemCategoryEnum = Database["public"]["Enums"]["item_category_enum"]

const ITEM_CATEGORY_ENUM_VALUES = new Set<ItemCategoryEnum>([
  "baking",
  "beverages",
  "condiments",
  "dairy",
  "meat_seafood",
  "pantry_staples",
  "produce",
  "snacks",
  "other",
  "spices",
])

class StandardizedIngredientsTable extends BaseTable<
  "standardized_ingredients",
  StandardizedIngredientRow,
  StandardizedIngredientInsert,
  StandardizedIngredientUpdate
> {
  private static instance: StandardizedIngredientsTable
  readonly tableName = "standardized_ingredients" as const

  private constructor() {
    super()
  }

  static getInstance(): StandardizedIngredientsTable {
    if (!StandardizedIngredientsTable.instance) {
      StandardizedIngredientsTable.instance = new StandardizedIngredientsTable()
    }
    return StandardizedIngredientsTable.instance
  }

  private normalizeCanonicalName(value: string): string {
    return value
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .replace(/ß/g, "ss")
      .replace(/[Ææ]/g, "ae")
      .replace(/[Œœ]/g, "oe")
      .replace(/[Øø]/g, "o")
      .replace(/[Łł]/g, "l")
      .replace(/[Đđ]/g, "d")
      .replace(/[Þþ]/g, "th")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  private normalizeCategoryValue(value?: string | null): string | null {
    if (typeof value !== "string") return null
    const normalized = value.trim().toLowerCase()
    return normalized.length > 0 ? normalized : null
  }

  private normalizeFoodItemValue(value?: boolean | null): boolean {
    return value !== false
  }

  private isValidItemCategoryEnum(value?: string | null): value is ItemCategoryEnum {
    return typeof value === "string" && ITEM_CATEGORY_ENUM_VALUES.has(value as ItemCategoryEnum)
  }

  private isInvalidItemCategoryEnumError(error: unknown): boolean {
    const code = (error as any)?.code
    const message = String((error as any)?.message ?? "")
    return code === "22P02" && message.includes("item_category_enum")
  }

  /**
   * Search by canonical name (exact match)
   */
  async findByCanonicalName(canonicalName: string): Promise<StandardizedIngredientRow | null> {
    try {
      const normalized = this.normalizeCanonicalName(canonicalName)
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
        .eq("canonical_name", normalized)
        .maybeSingle()

      if (error) {
        this.handleError(error, "findByCanonicalName")
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, "findByCanonicalName")
      return null
    }
  }

  /**
   * Search using full-text search (uses search_vector)
   * Returns ranked results by relevance
   */
  async searchByText(
    query: string,
    options?: {
      limit?: number
      similarityThreshold?: number
    }
  ): Promise<StandardizedIngredientRow[]> {
    try {
      console.log(`[StandardizedIngredientsTable] Searching for: ${query}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
      // Add the configuration object as the third argument
        .textSearch("search_vector", query, {
          config: "english",
          type: "plain" // <--- This is the key change
        })
        .limit(options?.limit || 10)
      if (error) {
        this.handleError(error, "searchByText")
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, "searchByText")
      return []
    }
  }

  /**
   * Fuzzy search using ILIKE with variants
   * Fallback when full-text search isn't available
   */
  async searchByVariants(variants: string[]): Promise<StandardizedIngredientRow[]> {
    try {
      if (variants.length === 0) return []

      console.log(`[StandardizedIngredientsTable] Searching variants: ${variants.join(", ")}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
        .ilike("canonical_name", `%${variants[0]}%`)

      if (error) {
        this.handleError(error, "searchByVariants")
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, "searchByVariants")
      return []
    }
  }

  /**
   * Get or create standardized ingredient (upsert pattern)
   */
  async getOrCreate(
    canonicalName: string,
    category?: string | null,
    isFoodItem?: boolean | null
  ): Promise<StandardizedIngredientRow | null> {
    try {
      const normalizedCanonicalName = this.normalizeCanonicalName(canonicalName)
      const normalizedCategory = this.normalizeCategoryValue(category)
      const normalizedIsFoodItem = this.normalizeFoodItemValue(isFoodItem)
      console.log(`[StandardizedIngredientsTable] Get or create: ${normalizedCanonicalName}`)

      // Try to find existing
      const existing = await this.findByCanonicalName(normalizedCanonicalName)
      if (existing) {
        const updatePayload: Record<string, unknown> = {}

        if (
          existing.category === "other" &&
          normalizedCategory &&
          normalizedCategory !== "other" &&
          this.isValidItemCategoryEnum(normalizedCategory)
        ) {
          updatePayload.category = normalizedCategory
        }

        if (existing.is_food_item !== normalizedIsFoodItem) {
          if (normalizedIsFoodItem === false) {
            updatePayload.is_food_item = false
          }
        }

        if (Object.keys(updatePayload).length > 0) {
          const { data: updated, error: updateError } = await this.supabase
            .from(this.tableName)
            .update(updatePayload as any)
            .eq("id", existing.id)
            .select()
            .single()
          if (!updateError && updated) return updated
        }
        return existing
      }

      // Create new
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert({
          canonical_name: normalizedCanonicalName,
          category: normalizedCategory,
          is_food_item: normalizedIsFoodItem,
        })
        .select()
        .single()

      if (error) {
        // Concurrent insert race or normalization-driven collision:
        // another writer already created this canonical row.
        if ((error as any)?.code === "23505") {
          const conflicted = await this.findByCanonicalName(normalizedCanonicalName)
          if (conflicted) return conflicted
        }

        // LLM may output invalid categories (e.g. "pasta") that do not match the DB enum.
        // Retry once with safe fallback category when and only when category is invalid.
        if (
          this.isInvalidItemCategoryEnumError(error) &&
          normalizedCategory &&
          !this.isValidItemCategoryEnum(normalizedCategory)
        ) {
          console.warn(
            `[StandardizedIngredientsTable] Invalid category "${normalizedCategory}" for "${normalizedCanonicalName}". Retrying with fallback category "other".`
          )

          const { data: retryData, error: retryError } = await this.supabase
            .from(this.tableName)
            .insert({
              canonical_name: normalizedCanonicalName,
              category: "other",
              is_food_item: normalizedIsFoodItem,
            })
            .select()
            .single()

          if (retryError) {
            if ((retryError as any)?.code === "23505") {
              const conflicted = await this.findByCanonicalName(normalizedCanonicalName)
              if (conflicted) return conflicted
            }
            this.handleError(retryError, "getOrCreate.retryInvalidCategory")
            return null
          }

          return retryData
        }

        this.handleError(error, "getOrCreate")
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, "getOrCreate")
      return null
    }
  }

  /**
   * Batch get or create multiple ingredients
   * CRITICAL: Single upsert instead of N queries
   */
  async batchGetOrCreate(
    items: Array<{ canonicalName: string; category: string | null; isFoodItem?: boolean | null }>
  ): Promise<Map<string, string>> {
    try {
      console.log(`[StandardizedIngredientsTable] Batch get or create: ${items.length} items`)

      const result = new Map<string, string>()

      if (items.length === 0) return result

      // Normalize + de-duplicate canonical names to avoid avoidable conflicts.
      const deduped = new Map<string, { canonical_name: string; category: string | null; is_food_item: boolean }>()
      let invalidCategoryFallbackCount = 0
      for (const item of items) {
        const normalized = this.normalizeCanonicalName(item.canonicalName)
        const normalizedCategory = this.normalizeCategoryValue(item.category)
        const normalizedIsFoodItem = this.normalizeFoodItemValue(item.isFoodItem)
        const safeCategory =
          normalizedCategory === null
            ? null
            : this.isValidItemCategoryEnum(normalizedCategory)
              ? normalizedCategory
              : "other"
        if (normalizedCategory !== null && safeCategory === "other" && normalizedCategory !== "other") {
          invalidCategoryFallbackCount += 1
        }
        if (!normalized) continue
        const existing = deduped.get(normalized)
        if (!existing) {
          deduped.set(normalized, {
            canonical_name: normalized,
            category: safeCategory,
            is_food_item: normalizedIsFoodItem,
          })
          continue
        }

        if (existing.category === "other" && safeCategory && safeCategory !== "other") {
          existing.category = safeCategory
        } else if (existing.category === null && safeCategory !== null) {
          existing.category = safeCategory
        }

        if (normalizedIsFoodItem === false) {
          existing.is_food_item = false
        }
      }

      if (invalidCategoryFallbackCount > 0) {
        console.warn(
          `[StandardizedIngredientsTable] Normalized ${invalidCategoryFallbackCount} invalid category value(s) to "other" during batch upsert.`
        )
      }

      if (!deduped.size) return result

      const insertData = Array.from(deduped.values())

      // Upsert all items (on conflict, do nothing - just return existing)
      const { data, error } = await this.supabase
        .from(this.tableName)
        .upsert(insertData, {
          onConflict: "canonical_name",
          ignoreDuplicates: true
        })
        .select()

      if (error) {
        this.handleError(error, "batchGetOrCreate")
        return result
      }

      const names = insertData.map((item) => item.canonical_name)
      const { data: resolvedRows, error: resolveError } = await this.supabase
        .from(this.tableName)
        .select("id, canonical_name")
        .in("canonical_name", names)

      if (resolveError) {
        this.handleError(resolveError, "batchGetOrCreate.resolve")
        return result
      }

      for (const row of resolvedRows || []) {
        result.set(row.canonical_name, row.id)
      }

      return result
    } catch (error) {
      this.handleError(error, "batchGetOrCreate")
      return new Map()
    }
  }

  /**
   * Get ingredients by category
   * Used for pantry item suggestions
   */
  async findByCategory(category: string): Promise<StandardizedIngredientRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
        .eq("category", category)
        .order("canonical_name", { ascending: true })

      if (error) {
        this.handleError(error, "findByCategory")
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, "findByCategory")
      return []
    }
  }

  /**
   * Batch fetch by IDs
   */
  async fetchByIds(ids: string[]): Promise<StandardizedIngredientRow[]> {
    try {
      if (ids.length === 0) return []

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
        .in("id", ids)

      if (error) {
        this.handleError(error, "fetchByIds")
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, "fetchByIds")
      return []
    }
  }
  /**
   * Fetches a sample of canonical names for system context or AI training.
   * Centralizes the logic used by the AI standardizer.
   */
  async getCanonicalNameSample(sampleSize = 200): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("canonical_name")
        .limit(sampleSize)

      if (error) {
        this.handleError(error, "getCanonicalNameSample")
        return []
      }

      return data
        .map((row) => row.canonical_name)
        .filter((name): name is string => !!name && name.trim().length > 0)
    } catch (error) {
      this.handleError(error, "getCanonicalNameSample")
      return []
    }
  }
}

export const standardizedIngredientsDB = StandardizedIngredientsTable.getInstance()
