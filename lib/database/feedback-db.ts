
import { BaseTable } from './base-db'
import type { Database } from '@/lib/supabase'

type FeedbackRow = Database['public']['Tables']['feedback']['Row']
type FeedbackInsert = Database['public']['Tables']['feedback']['Insert']
type FeedbackUpdate = Database['public']['Tables']['feedback']['Update']

class FeedbackTable extends BaseTable<
  'feedback',
  FeedbackRow,
  FeedbackInsert,
  FeedbackUpdate
> {
  private static instance: FeedbackTable
  readonly tableName = 'feedback' as const

  private constructor() {
    super()
  }

  static getInstance(): FeedbackTable {
    if (!FeedbackTable.instance) {
      FeedbackTable.instance = new FeedbackTable()
    }
    return FeedbackTable.instance
  }

  /**
   * Submit feedback (create)
   */
  async submitFeedback(
    message: string,
    userId?: string | null
  ): Promise<FeedbackRow | null> {
    try {
      console.log(`[FeedbackTable] Submitting feedback from user: ${userId || 'anonymous'}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert({ message, user_id: userId || null })
        .select()
        .single()

      if (error) {
        this.handleError(error, 'submitFeedback')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'submitFeedback')
      return null
    }
  }

  /**
   * Get all feedback (admin only)
   * With filtering options
   */
  async findAll(options?: {
    unreadOnly?: boolean
    userId?: string
    limit?: number
    offset?: number
  }): Promise<FeedbackRow[]> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .order('created_at', { ascending: false })

      if (options?.unreadOnly) {
        query = query.eq('read', false)
      }

      if (options?.userId) {
        query = query.eq('user_id', options.userId)
      }

      if (options?.limit) {
        query = query.limit(options.limit)
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
      }

      const { data, error } = await query

      if (error) {
        this.handleError(error, 'findAll')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findAll')
      return []
    }
  }

  /**
   * Get feedback by user
   */
  async findByUserId(userId: string): Promise<FeedbackRow[]> {
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
   * Mark feedback as read (admin action)
   */
  async markAsRead(feedbackId: string): Promise<FeedbackRow | null> {
    try {
      console.log(`[FeedbackTable] Marking feedback as read: ${feedbackId}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({ read: true })
        .eq('id', feedbackId)
        .select()
        .single()

      if (error) {
        this.handleError(error, 'markAsRead')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'markAsRead')
      return null
    }
  }

  /**
   * Batch mark multiple as read
   */
  async batchMarkAsRead(feedbackIds: string[]): Promise<boolean> {
    try {
      if (feedbackIds.length === 0) return true

      console.log(`[FeedbackTable] Batch marking ${feedbackIds.length} items as read`)

      const { error } = await this.supabase
        .from(this.tableName)
        .update({ read: true })
        .in('id', feedbackIds)

      if (error) {
        this.handleError(error, 'batchMarkAsRead')
        return false
      }

      return true
    } catch (error) {
      this.handleError(error, 'batchMarkAsRead')
      return false
    }
  }

  /**
   * Get unread count (for admin notifications)
   */
  async getUnreadCount(): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('read', false)

      if (error) {
        this.handleError(error, 'getUnreadCount')
        return 0
      }

      return count || 0
    } catch (error) {
      this.handleError(error, 'getUnreadCount')
      return 0
    }
  }

  /**
   * Get recent feedback
   */
  async findRecent(limit?: number): Promise<FeedbackRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit || 10)

      if (error) {
        this.handleError(error, 'findRecent')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findRecent')
      return []
    }
  }

  /**
   * Search feedback by message content
   */
  async search(query: string): Promise<FeedbackRow[]> {
    try {
      console.log(`[FeedbackTable] Searching for: ${query}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .ilike('message', `%${query}%`)
        .order('created_at', { ascending: false })

      if (error) {
        this.handleError(error, 'search')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'search')
      return []
    }
  }
}

export const feedbackDB = FeedbackTable.getInstance()
