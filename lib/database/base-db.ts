import { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { supabase, Database } from '@/lib/supabase';

// Define types for table names valid in the database schema
type TableName = keyof Database['public']['Tables'];

// Define generic types for Row, Insert, and Update based on the schema
type Row<T extends TableName> = Database['public']['Tables'][T]['Row'];
type Insert<T extends TableName> = Database['public']['Tables'][T]['Insert'];
type Update<T extends TableName> = Database['public']['Tables'][T]['Update'];

/**
 * An abstract class for creating database service classes.
 * Provides common CRUD operations and standardizes error handling and mapping.
 *
 * @template T - The table name from the Database schema.
 * @template TRow - Application-level representation of a row.
 * @template TInsert - Type for inserting new records.
 * @template TUpdate - Type for updating existing records.
 */
export abstract class BaseTable<
  T extends TableName,
  TRow = Row<T>,
  TInsert = Insert<T>,
  TUpdate = Update<T>
> {
  protected readonly supabase: SupabaseClient<Database>;
  
  /**
   * Must be defined in the subclass (e.g., readonly tableName = "recipes" as const)
   */
  abstract readonly tableName: T;

  constructor() {
    this.supabase = supabase;
  }

  /**
   * Maps raw database results to an application-specific type.
   * Subclasses should override this to handle JSONB parsing or nested objects.
   */
  protected map(data: any): TRow {
    return data as TRow;
  }
  
  /**
   * Centralized error handler using an arrow function to preserve 'this' context.
   * Prevents crashes during early initialization if tableName is not yet set.
   */
  protected handleError = (error: PostgrestError | Error | any, context: string) => {
      const name = this.tableName || 'UnknownTable';
      const errorMessage = error?.message || 'Unknown error';
      console.error(`[${this.constructor.name}:${name}] Error in ${context}:`, errorMessage, error);
  }

  /**
   * Fetches a single record by its ID.
   * Uses maybeSingle() to return null gracefully if no record is found.
   */
  async findById(id: string): Promise<TRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.handleError(error, `findById(${id})`);
      return null;
    }

    return data ? this.map(data) : null;
  }

  /**
   * Fetches all records from the table.
   */
  async findAll(): Promise<TRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*');

    if (error) {
      this.handleError(error, `findAll()`);
      return [];
    }

    return (data || []).map(d => this.map(d));
  }

  /**
   * Creates a new record.
   * @param insertData - The data to insert (validated against TInsert).
   */
  async create(insertData: TInsert): Promise<TRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(insertData as any)
      .select()
      .single();

    if (error) {
      this.handleError(error, `create()`);
      return null;
    }

    return data ? this.map(data) : null;
  }

  /**
   * Updates a record by its ID.
   * @param id - The UUID of the record.
   * @param updateData - Partial update data.
   */
  async update(id: string, updateData: TUpdate): Promise<TRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updateData as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.handleError(error, `update(${id})`);
      return null;
    }
    
    return data ? this.map(data) : null;
  }

  /**
   * Performs a hard delete on a record.
   * Note: If using soft-deletes, override this in the subclass.
   */
  async remove(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      this.handleError(error, `remove(${id})`);
      return false;
    }
    return true;
  }

  /**
   * Static helper for direct query builder access if needed.
   */
  static from<K extends TableName>(tableName: K) {
    return supabase.from(tableName);
  }
}

/**
 * Standalone helper function for direct query builder access.
 * Use this instead of BaseTable.from() to avoid bundling issues with static methods.
 */
export function from<K extends TableName>(tableName: K) {
  return supabase.from(tableName);
}