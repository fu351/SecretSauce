/**
 * Universal database error logger for scrapers.
 * Writes HTTP error events to the scraper_http_errors table (formerly target_404_log)
 * for post-run analysis across all providers.
 */

let _supabase = null;

function getSupabaseClient() {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  const { createClient } = require('@supabase/supabase-js');
  _supabase = createClient(supabaseUrl, supabaseKey);
  return _supabase;
}

/**
 * Persists a scraper HTTP error to the database for analysis.
 *
 * @param {object} params
 * @param {string}  params.storeEnum       - Provider identifier, e.g. 'target', 'walmart'
 * @param {string}  [params.zipCode]       - ZIP code being scraped
 * @param {string}  [params.storeId]       - Provider-internal store ID
 * @param {string}  [params.storeIdSource] - How the store ID was resolved, e.g. 'db_metadata'
 * @param {string}  [params.ingredientName]- Ingredient/keyword being searched
 * @param {string}  [params.groceryStoreId]- Internal grocery_stores.id FK
 * @param {string}  [params.errorMessage]  - Human-readable error description
 * @param {string}  [params.requestUrl]    - URL that produced the error
 * @param {number}  [params.httpStatus=404]- HTTP status code
 */
async function logHttpErrorToDatabase({
  storeEnum,
  zipCode = null,
  storeId = null,
  storeIdSource = null,
  ingredientName = null,
  groceryStoreId = null,
  errorMessage = null,
  requestUrl = null,
  httpStatus = 404,
} = {}) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return; // Supabase not configured — skip silently

    const { error } = await supabase
      .from('target_404_log')
      .insert({
        store_enum: storeEnum,
        zip_code: zipCode,
        target_store_id: storeId,
        store_id_source: storeIdSource,
        ingredient_name: ingredientName,
        grocery_store_id: groceryStoreId,
        error_message: errorMessage,
        http_status: httpStatus,
        request_url: requestUrl,
      });

    if (error) throw error;
  } catch (err) {
    // Never let logging failures propagate to the caller
    console.warn(`[db-error-logger] Failed to persist HTTP ${httpStatus} event for ${storeEnum}:`, err.message);
  }
}

module.exports = { logHttpErrorToDatabase };
