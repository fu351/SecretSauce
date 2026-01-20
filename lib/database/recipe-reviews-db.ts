"use client"

import { BaseTable } from './base-db'
import type { Database } from '@/lib/supabase'
import { profileDB } from './profile-db'
import { recipeDB } from './recipe-db'

type RecipeReviewRow = Database['public']['Tables']['recipe_reviews']['Row']
type RecipeReviewInsert = Database['public']['Tables']['recipe_reviews']['Insert']
type RecipeReviewUpdate = Database['public']['Tables']['recipe_reviews']['Update']

export type RecipeReviewWithUser = RecipeReviewRow & {
  user_email?: string
  user_name?: string | null
}

export type RecipeReviewWithDetails = RecipeReviewRow & {
  recipe_title?: string
  user_name?: string | null
}

class RecipeReviewsTable extends BaseTable<
  'recipe_reviews',
  RecipeReviewRow,
  RecipeReviewInsert,
  RecipeReviewUpdate
> {
  private static instance: RecipeReviewsTable
  readonly tableName = 'recipe_reviews' as const

  private constructor() {
    super()
  }

  static getInstance(): RecipeReviewsTable {
    if (!RecipeReviewsTable.instance) {
      RecipeReviewsTable.instance = new RecipeReviewsTable()
    }
    return RecipeReviewsTable.instance
  }

  /**
   * Get all reviews for a recipe with user profile data
   * Uses relationship join to fetch user info in single query
   */
  async findByRecipeId(recipeId: string): Promise<RecipeReviewWithUser[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select(`
          *,
          profiles (email, full_name)
        `)
        .eq('recipe_id', recipeId)
        .order('created_at', { ascending: false })

      if (error) {
        this.handleError(error, 'findByRecipeId')
        return []
      }

      if (!data) return []

      // Transform the data to flatten the profiles relationship
      return data.map(review => ({
        ...review,
        user_email: (review as any).profiles?.email,
        user_name: (review as any).profiles?.full_name,
        profiles: undefined // Remove the nested object
      })) as RecipeReviewWithUser[]
    } catch (error) {
      this.handleError(error, 'findByRecipeId')
      return []
    }
  }

  /**
   * Get a user's review for a specific recipe
   * Used to check if user has already reviewed
   */
  async findByUserAndRecipe(
    userId: string,
    recipeId: string
  ): Promise<RecipeReviewRow | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('recipe_id', recipeId)
        .single()

      if (error) {
        this.handleError(error, 'findByUserAndRecipe')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'findByUserAndRecipe')
      return null
    }
  }

  /**
   * Get all reviews by a user
   * Used for user profile/activity page
   */
  async findByUserId(userId: string): Promise<RecipeReviewRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        this.handleError(error, 'findByUserId')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findByUserId')
      return []
    }
  }

  /**
   * Create a review (with duplicate check)
   * Automatically updates recipe rating_avg and rating_count
   */
  async createReview(
    recipeId: string,
    userId: string,
    rating: number,
    comment?: string | null
  ): Promise<RecipeReviewRow | null> {
    try {
      console.log(`[RecipeReviewsTable] Creating review for recipe ${recipeId} by user ${userId}`)

      // Check if user already reviewed this recipe
      const existing = await this.findByUserAndRecipe(userId, recipeId)
      if (existing) {
        console.log(`[RecipeReviewsTable] User ${userId} already reviewed recipe ${recipeId}`)
        return null
      }

      // Create the review
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert({
          recipe_id: recipeId,
          user_id: userId,
          rating,
          comment: comment || null
        })
        .select()
        .single()

      if (error) {
        this.handleError(error, 'createReview')
        return null
      }

      // Update recipe rating aggregate
      await this.updateRecipeRating(recipeId)

      return data
    } catch (error) {
      this.handleError(error, 'createReview')
      return null
    }
  }

  /**
   * Update a review
   * Automatically recalculates recipe rating_avg
   */
  async updateReview(
    reviewId: string,
    updates: {
      rating?: number
      comment?: string | null
    }
  ): Promise<RecipeReviewRow | null> {
    try {
      console.log(`[RecipeReviewsTable] Updating review ${reviewId}`)

      // Get current review to know which recipe to update
      const current = await this.findById(reviewId)
      if (!current) {
        console.log(`[RecipeReviewsTable] Review ${reviewId} not found`)
        return null
      }

      // Update the review
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          rating: updates.rating,
          comment: updates.comment,
          updated_at: new Date().toISOString()
        })
        .eq('id', reviewId)
        .select()
        .single()

      if (error) {
        this.handleError(error, 'updateReview')
        return null
      }

      // Update recipe rating aggregate if rating changed
      if (updates.rating !== undefined) {
        await this.updateRecipeRating(current.recipe_id)
      }

      return data
    } catch (error) {
      this.handleError(error, 'updateReview')
      return null
    }
  }

  /**
   * Delete a review
   * Automatically recalculates recipe rating_avg and rating_count
   */
  async deleteReview(reviewId: string): Promise<boolean> {
    try {
      console.log(`[RecipeReviewsTable] Deleting review ${reviewId}`)

      // Get current review to know which recipe to update
      const current = await this.findById(reviewId)
      if (!current) {
        console.log(`[RecipeReviewsTable] Review ${reviewId} not found`)
        return false
      }

      // Delete the review
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('id', reviewId)

      if (error) {
        this.handleError(error, 'deleteReview')
        return false
      }

      // Update recipe rating aggregate
      await this.updateRecipeRating(current.recipe_id)

      return true
    } catch (error) {
      this.handleError(error, 'deleteReview')
      return false
    }
  }

  /**
   * Calculate rating statistics for a recipe
   * Returns aggregated data (avg, count, distribution)
   */
  async getRatingStats(recipeId: string): Promise<{
    average: number
    count: number
    distribution: Record<number, number>
  }> {
    try {
      const reviews = await this.supabase
        .from(this.tableName)
        .select('rating')
        .eq('recipe_id', recipeId)

      if (reviews.error || !reviews.data || reviews.data.length === 0) {
        return {
          average: 0,
          count: 0,
          distribution: {}
        }
      }

      const ratings = reviews.data.map(r => r.rating)
      const count = ratings.length
      const sum = ratings.reduce((acc, r) => acc + r, 0)
      const average = sum / count

      // Calculate distribution (1-5 stars)
      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      for (const rating of ratings) {
        distribution[rating] = (distribution[rating] || 0) + 1
      }

      return {
        average,
        count,
        distribution
      }
    } catch (error) {
      this.handleError(error, 'getRatingStats')
      return {
        average: 0,
        count: 0,
        distribution: {}
      }
    }
  }

  /**
   * Batch fetch reviews for multiple recipes
   * Used for recipe list pages
   */
  async findByRecipeIds(
    recipeIds: string[]
  ): Promise<Map<string, RecipeReviewRow[]>> {
    try {
      if (recipeIds.length === 0) return new Map()

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .in('recipe_id', recipeIds)
        .order('created_at', { ascending: false })

      if (error) {
        this.handleError(error, 'findByRecipeIds')
        return new Map()
      }

      // Group reviews by recipe ID
      const reviewsByRecipe = new Map<string, RecipeReviewRow[]>()
      if (data) {
        for (const review of data) {
          const recipeReviews = reviewsByRecipe.get(review.recipe_id) || []
          recipeReviews.push(review)
          reviewsByRecipe.set(review.recipe_id, recipeReviews)
        }
      }

      return reviewsByRecipe
    } catch (error) {
      this.handleError(error, 'findByRecipeIds')
      return new Map()
    }
  }

  /**
   * Get recent reviews across all recipes
   * Used for activity feed
   */
  async findRecent(limit: number = 10): Promise<RecipeReviewWithDetails[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select(`
          *,
          profiles (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        this.handleError(error, 'findRecent')
        return []
      }

      if (!data) return []

      // Fetch recipe titles for all reviews
      const recipeIds = [...new Set(data.map(r => r.recipe_id))]
      const recipes = await recipeDB.fetchByIds(recipeIds)
      const recipeTitles = new Map(recipes.map(r => [r.id, r.title]))

      // Transform the data
      return data.map(review => ({
        ...review,
        recipe_title: recipeTitles.get(review.recipe_id) || undefined,
        user_name: (review as any).profiles?.full_name,
        profiles: undefined
      })) as RecipeReviewWithDetails[]
    } catch (error) {
      this.handleError(error, 'findRecent')
      return []
    }
  }

  /**
   * Helper: Update recipe rating aggregate after review change
   * Private method called after create/update/delete
   */
  private async updateRecipeRating(recipeId: string): Promise<boolean> {
    try {
      console.log(`[RecipeReviewsTable] Updating rating aggregate for recipe ${recipeId}`)

      const stats = await this.getRatingStats(recipeId)

      // Update the recipe
      const updated = await recipeDB.update(recipeId, {
        rating_avg: stats.average,
        rating_count: stats.count
      })

      if (!updated) {
        console.log(`[RecipeReviewsTable] Failed to update recipe ${recipeId} rating`)
        return false
      }

      console.log(`[RecipeReviewsTable] Updated recipe ${recipeId} rating: avg=${stats.average}, count=${stats.count}`)
      return true
    } catch (error) {
      this.handleError(error, 'updateRecipeRating')
      return false
    }
  }
}

export const recipeReviewsDB = RecipeReviewsTable.getInstance()
