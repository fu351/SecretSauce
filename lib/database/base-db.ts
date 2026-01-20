"use client"

import { SupabaseClient } from '@supabase/supabase-js';
import { supabase, Database } from '@/lib/supabase';

// Define a type for table names that are valid for this base class
type TableName = keyof Database['public']['Tables'];

// Define a generic type for a row in a table
type Row<T extends TableName> = Database['public']['Tables'][T]['Row'];
type Insert<T extends TableName> = Database['public']['Tables'][T]['Insert'];
type Update<T extends TableName> = Database['public']['Tables'][T]['Update'];

/**
 * An abstract class for creating database service classes.
 * It provides common CRUD operations and handles the Supabase client.
 *
 * @template T - The name of the table.
 * @template TRow - The type of a row in the table.
 * @template TInsert - The type for inserting a new row.
 * @template TUpdate - The type for updating a row.
 */
export abstract class BaseTable<
  T extends TableName,
  TRow = Row<T>,
  TInsert = Insert<T>,
  TUpdate = Update<T>
> {
  protected readonly supabase: SupabaseClient<Database>;
  
  // The table name must be provided by the subclass
  abstract readonly tableName: T;

  constructor() {
    this.supabase = supabase;
  }

  /**
   * An optional method for mapping raw DB results to a specific application type.
   * By default, it returns the data as is.
   * @param data The raw data from the database.
   * @returns The mapped data.
   */
  protected map(data: any): TRow {
    return data as TRow;
  }
  
  /**
   * A centralized error handler.
   * @param error The error object.
   * @param context A string providing context for where the error occurred.
   */
  protected handleError(error: any, context: string) {
      console.error(`[${this.constructor.name}:${this.tableName}] Error in ${context}:`, error);
  }

  /**
   * Fetches a single record by its ID.
   * @param id The ID of the record to fetch.
   * @returns The mapped record or null if not found or on error.
   */
  async findById(id: string): Promise<TRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      this.handleError(error, `findById(${id})`);
      return null;
    }

    return data ? this.map(data) : null;
  }

  /**
   * Fetches all records from the table.
   * @returns An array of mapped records.
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
   * Creates a new record in the table.
   * @param insertData The data to insert.
   * @returns The newly created and mapped record, or null on error.
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
   * @param id The ID of the record to update.
   * @param updateData The data to update.
   * @returns The updated and mapped record, or null on error.
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
   * Deletes a record by its ID.
   * @param id The ID of the record to delete.
   * @returns True if successful, false otherwise.
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

  // This allows the instance to access the query builder
  static from<K extends TableName>(tableName: K) {
    return supabase.from(tableName);
  }
}
