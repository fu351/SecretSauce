# Database Schema Documentation

## Agent Metadata

- `Doc Kind`: `reference`
- `Canonicality`: `reference`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `lib/database/`, `supabase/migrations/`, `migrations/`
- `Update Trigger`: Schema, triggers, RPCs, enums, or key table ownership changes.

## Agent Use

- `Read this when`: validating schema-level behavior, trigger paths, and RPC contracts.
- `Stop reading when`: task is purely UI/component behavior.
- `Escalate to`: `supabase/migrations/`, `lib/database/*`, `docs/agent-canonical-context.md`.


**Project:** `bfycdolbspgmkezpeuly` (Supabase)
**PostgreSQL 17** with PostGIS, pg_trgm, http, pg_net extensions

---

## Architecture Overview

The system is a grocery price comparison engine that scrapes product prices from multiple stores, standardizes ingredients and units, and enables cost-optimized meal planning and shopping.

### Core Data Flow

```
Scraper (GitHub Actions, nightly)
  → fn_bulk_insert_ingredient_history(jsonb)
    → Fuzzy match product → standardized_ingredient (fn_match_ingredient)
    → Regex parse unit from product name
    → Lookup unit in unit_standardization_map
    → Find/create product_mapping (keyed by external_product_id + store_brand + zip_code)
    → Calculate unit_price (price / normalized qty in base imperial unit)
    → Queue to ingredient_match_queue if low confidence (ingredient OR unit)
    → INSERT into ingredients_history (price log)
    → UPSERT into ingredients_recent (current snapshot)

LLM Queue Processor (external)
  → Reads ingredient_match_queue WHERE status = 'pending'
  → Resolves ingredient and/or unit (separate ingredient/unit prompts)
    → Unit writes only when worker unit resolution is enabled and above confidence threshold
  → Sets status = 'resolved' → trigger fn_backfill_resolved_ingredient fires
    → Updates product_mappings.standardized_ingredient_id / unit / quantity
  → trigger fn_backfill_resolved_confidence fires
    → Updates product_mappings.unit_confidence / quantity_confidence from queue confidences
```

### Key Design Principles

- **product_mappings** is the single source of truth for product identity (name, image, unit, ingredient mapping)
- **ingredients_history** is a slim price log (5 columns) — all product data accessed via JOIN to product_mappings
- **ingredients_recent** is a current-price snapshot (7 columns) — same JOIN pattern
- **No triggers on ingredients_history** — all processing happens in `fn_bulk_insert_ingredient_history`
- **Unit standardization** defaults to `'unit'` when unresolved; LLM upgrades later via the queue

---

## Tables

### Core Price Pipeline

#### `product_mappings` — Single source of product truth (4,359 rows)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `external_product_id` | text | NO | | Store's product ID |
| `store_brand` | grocery_store (enum) | NO | | Store brand (e.g., 'kroger', 'target') |
| `zip_code` | text | YES | | Regional key |
| `raw_product_name` | text | YES | | Original scraped product name |
| `image_url` | text | YES | | Product image URL |
| `standardized_ingredient_id` | uuid FK | YES | | → standardized_ingredients.id |
| `ingredient_confidence` | numeric | YES | 0.0 | Match confidence (0–1) |
| `standardized_unit` | unit_label FK | YES | | → unit_canonical.standard_unit |
| `standardized_quantity` | numeric | YES | | Package quantity in standardized unit |
| `unit_confidence` | numeric | YES | 0.0 | Unit mapping confidence (0–1) |
| `quantity_confidence` | numeric | YES | | Quantity extraction confidence (0–1) |
| `manual_override` | boolean | YES | false | If true, LLM/fuzzy matching skipped |
| `last_seen_at` | timestamptz | YES | now() | Last time scraper encountered this product |
| `modal_opened_count` | integer | YES | 1 | UI analytics |
| `exchange_count` | integer | YES | 1 | Times seen by scraper |

**Unique index:** `(external_product_id, store_brand, zip_code)`
**FKs:** standardized_ingredient_id → standardized_ingredients, standardized_unit → unit_canonical, zip_code → scraped_zipcodes

---

#### `ingredients_history` — Price log (10,510 rows)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `product_mapping_id` | uuid FK | NO | | → product_mappings.id |
| `grocery_store_id` | uuid FK | YES | | → grocery_stores.id (physical location) |
| `price` | numeric | YES | | Scraped sticker price |
| `created_at` | timestamptz | YES | now() | When scraped |

---

#### `ingredients_recent` — Current price snapshot (806 rows)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | | PK |
| `product_mapping_id` | uuid FK | NO | | → product_mappings.id (UNIQUE) |
| `grocery_store_id` | uuid FK | YES | | → grocery_stores.id |
| `price` | numeric | NO | | Current sticker price |
| `unit_price` | numeric | YES | | price / converted qty in base imperial unit |
| `created_at` | timestamptz | YES | now() | |
| `updated_at` | timestamptz | YES | now() | |

---

#### `ingredient_match_queue` — LLM review queue (1,748 rows)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `product_mapping_id` | uuid FK | YES | | → product_mappings.id |
| `recipe_ingredient_id` | uuid FK | YES | | → recipe_ingredients.id |
| `raw_product_name` | text | NO | | Original product name |
| `cleaned_name` | text | NO | | Cleaned via fn_clean_product_name |
| `best_fuzzy_match` | text | YES | | Best match from standardized_ingredients |
| `fuzzy_score` | numeric | YES | | Confidence of fuzzy match |
| `status` | text | NO | 'pending' | pending / processing / resolved / failed |
| `source` | text | NO | 'scraper' | scraper / recipe |
| `needs_ingredient_review` | boolean | NO | false | Flag: ingredient match needs LLM |
| `needs_unit_review` | boolean | NO | false | Flag: unit mapping needs LLM |
| `raw_unit` | text | YES | | Raw parsed unit string for LLM |
| `resolved_ingredient_id` | uuid FK | YES | | → standardized_ingredients.id |
| `resolved_unit` | unit_label | YES | | LLM-resolved standard unit |
| `resolved_quantity` | numeric | YES | | LLM-resolved quantity |
| `unit_confidence` | numeric(4,3) | YES | | Unit resolution confidence (0–1) |
| `quantity_confidence` | numeric(4,3) | YES | | Quantity resolution confidence (0–1) |
| `resolved_by` | text | YES | | Who/what resolved |
| `resolved_at` | timestamptz | YES | | When resolved |
| `processing_started_at` | timestamptz | YES | | Lease start |
| `processing_lease_expires_at` | timestamptz | YES | | Lease expiry |
| `attempt_count` | integer | NO | 0 | Retry counter |
| `last_error` | text | YES | | Last error message |
| `created_at` | timestamptz | YES | now() | |

**Unique indexes:** One row per product_mapping_id, one row per recipe_ingredient_id
**Status constraint:** pending / processing / resolved / failed

---

### Reference Data

#### `standardized_ingredients` — Ingredient dictionary (467 rows)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `canonical_name` | text | NO | | e.g., "chicken breast", "whole milk" |
| `category` | item_category_enum | YES | 'other' | Grocery aisle category |
| `search_vector` | tsvector | YES | | Full-text search index |
| `default_unit` | unit_label FK | YES | | Most common unit for this ingredient |
| `estimated_unit_weight_oz` | numeric | YES | | Inferred weight per "unit" (from price analysis) |
| `estimated_unit_weight_confidence` | numeric | YES | | Confidence of weight estimate |
| `estimated_unit_weight_sample_size` | integer | YES | | Number of products used to estimate |
| `estimated_unit_weight_updated_at` | timestamptz | YES | | |
| `created_at` | timestamptz | YES | now() | |
| `updated_at` | timestamptz | YES | now() | |

---

#### `unit_canonical` — Valid units (20 rows)

| Column | Type | Description |
|--------|------|-------------|
| `standard_unit` | unit_label (enum) PK | See `unit_label` in Enums section |
| `category` | unit_category (enum) | weight / volume / count / other |

#### `unit_conversions` — Conversion factors (75 rows)

| Column | Type | Description |
|--------|------|-------------|
| `from_unit` | unit_label FK | |
| `to_unit` | unit_label FK | |
| `multiplier` | numeric | from_unit × multiplier = to_unit |

#### `unit_standardization_map` — Raw text → standard unit (51 rows)

| Column | Type | Description |
|--------|------|-------------|
| `raw_input_string` | text PK | e.g., "oz", "ounce", "fl oz" |
| `standard_unit` | unit_label FK | Resolved standard unit (NULL if unresolved) |
| `confidence_score` | numeric | 0.0–1.0 |
| `updated_at` | timestamptz | |

#### `category_default_unit_weights` — Fallback weights by category (9 rows)

| Column | Type | Description |
|--------|------|-------------|
| `category` | item_category_enum PK | |
| `default_unit_weight_oz` | numeric | Default oz per "unit" for this category |
| `description` | text | |

---

### Store Infrastructure

#### `grocery_stores` — Physical store locations (11,229 rows)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | NO | PK |
| `store_enum` | grocery_store (enum) | NO | Brand identifier |
| `name` | text | NO | Display name |
| `address` | text | YES | |
| `zip_code` | text FK | YES | → scraped_zipcodes |
| `city` | text | YES | |
| `state` | text | YES | |
| `geom` | geography(Point) | YES | PostGIS location |
| `is_active` | boolean | YES | true |
| `failure_count` | smallint | NO | 0 |
| `metadata` | jsonb | YES | {} |
| `created_at` | timestamptz | YES | now() |

#### `scraped_zipcodes` — Zip codes with scraping coverage (6,589 rows)

| Column | Type | Description |
|--------|------|-------------|
| `zip_code` | text PK | |
| `last_scraped_at` | timestamptz | |
| `store_count` | integer | Number of stores in this zip |
| `latitude` / `longitude` | float8 | |
| `geom` | geography(Point) | |
| `city` / `state` | text | |

#### `target_zipcodes` — Priority zip codes for scraping (3 rows)

| Column | Type | Description |
|--------|------|-------------|
| `zip_code` | text PK | |
| `reason` | text | Why this zip is targeted |
| `user_count` | integer | Users in this zip |
| `priority` | integer | Scraping priority |

#### `user_preferred_stores` — User's nearby stores (14 rows)

| Column | Type | Description |
|--------|------|-------------|
| `profile_id` | uuid FK | → profiles |
| `grocery_store_id` | uuid FK | → grocery_stores |
| `store_enum` | grocery_store | |
| `distance_miles` | numeric | |

---

### User & Recipe System

#### `profiles` — User accounts (3 rows)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | = auth.users.id |
| `email` | text | |
| `full_name` | text | |
| `zip_code` | text FK | → scraped_zipcodes |
| `geom` | geography(Point) | |
| `latitude` / `longitude` | float8 | |
| `city` / `state` / `country` | text | |
| `formatted_address` | text | |
| `dietary_preferences` | text[] | |
| `cuisine_preferences` | text[] | |
| `cooking_level` / `budget_range` | text | |
| `cooking_time_preference` | text | 'any' |
| `grocery_distance_miles` | integer | 10 |
| `theme_preference` | text | 'dark' |
| `subscription_tier` | subscription_tier | See `subscription_tier` in Enums section |
| `stripe_customer_id` / `stripe_subscription_id` | text | |
| `tutorial_completed` | boolean | |

#### `recipes` (34 rows)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `title` | text | |
| `author_id` | uuid | |
| `cuisine` | cuisine_type_enum | |
| `meal_type` | meal_type_enum | |
| `protein` | protein_type_enum | |
| `difficulty` | recipe_difficulty | |
| `servings` | integer | |
| `prep_time` / `cook_time` | integer | minutes |
| `instructions_list` | text[] | |
| `description` | text | |
| `image_url` | text | |
| `tags` | tags_enum[] | |
| `nutrition` | jsonb | |
| `rating_avg` / `rating_count` | numeric / integer | |
| `deleted_at` | timestamptz | Soft delete |

#### `recipe_ingredients` (308 rows)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `recipe_id` | uuid FK | → recipes |
| `standardized_ingredient_id` | uuid FK | → standardized_ingredients |
| `display_name` | text | |
| `quantity` | numeric | |
| `units` | text | |
| `deleted_at` | timestamptz | Soft delete |

#### `shopping_list_items` (25 rows)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `source_type` | shopping_list_source_type | recipe / manual |
| `recipe_id` | uuid FK | → recipes (if from recipe) |
| `recipe_ingredient_id` | uuid FK | → recipe_ingredients |
| `name` | text | |
| `quantity` | numeric | 1 |
| `unit` | text | |
| `ingredient_id` | uuid FK | → standardized_ingredients |
| `category` | item_category_enum | |
| `checked` | boolean | false |
| `servings` | numeric | |

---

### Other Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `meal_schedule` | 0 | Weekly meal calendar |
| `pantry_items` | 0 | User's pantry inventory |
| `store_list_history` | 0 | Delivery/purchase log |
| `recipe_favorites` | 0 | User favorites |
| `recipe_reviews` | 0 | User ratings |
| `recipe_analytics_logs` | 0 | Event tracking |
| `user_analytics_snapshots` | 12 | Periodic user stats |
| `user_nutrition_history` | 0 | Daily nutrition log |
| `waste_analytics` | 0 | Food waste tracking |
| `manual_shopping_history` | 0 | Frequent manual items |
| `shopping_calculation_logs` | 0 | Basket cost calculations |
| `price_history` | 0 | Legacy price tracking |
| `failed_scrapes_log` | 423 | Scraper error log |
| `scraping_events` | 0 | Scraping job tracking |
| `target_404_log` | 17,519 | Target.com 404 errors |
| `unrecognized_inputs_log` | 244 | Unknown unit/ingredient log |
| `unit_conversion_failures` | 0 | Failed conversion attempts |
| `feedback` | 1 | User feedback |

---

## Views

| View | Description |
|------|-------------|
| `product_mappings_with_names` | product_mappings LEFT JOIN standardized_ingredients for canonical_name |
| `v_unit_conversion_coverage` | Tests all shopping_unit ↔ product_unit pairs for convertibility |
| `user_meal_type_statistics` | Aggregated meal type preferences |
| `view_popular_recipes` | Recipes ordered by rating |
| `view_trending_recipes` | Recently popular recipes |

---

## Enums

| Enum | Values |
|------|--------|
| `grocery_store` | aldi, kroger, safeway, meijer, target, traderjoes, 99ranch, walmart, ... |
| `unit_label` | oz, lb, fl oz, ml, gal, ct, each, bunch, gram, unit, g, tsp, tbsp, cup, kg, quart, pint, liter, mg, dozen |
| `unit_category` | weight, volume, count, other |
| `item_category_enum` | baking, beverages, condiments, dairy, meat_seafood, pantry_staples, produce, snacks, frozen, other, ... |
| `meal_type_enum` | breakfast, lunch, dinner, snack, dessert |
| `protein_type_enum` | chicken, beef, pork, fish, shellfish, turkey, tofu, legume, egg, ... |
| `cuisine_type_enum` | italian, mexican, chinese, indian, american, french, japanese, ... |
| `recipe_difficulty` | beginner, intermediate, advanced |
| `shopping_list_source_type` | recipe, manual |
| `subscription_tier` | free, premium |
| `tags_enum` | vegetarian, vegan, gluten-free, dairy-free, keto, paleo, low-calorie, ... |

---

## Key Functions

### Data Ingestion

| Function | Description |
|----------|-------------|
| `fn_bulk_insert_ingredient_history(jsonb)` | Main scraper entry point. Parses units, matches ingredients, creates/finds product mappings, calculates unit prices, queues for LLM review, inserts history, upserts recent. |
| `fn_match_ingredient(text)` | Fuzzy matches product name → standardized_ingredient. Returns matched_id, confidence, match_strategy. |
| `fn_clean_product_name(text)` | Strips brand noise from product names. |

### Price Retrieval

| Function | Description |
|----------|-------------|
| `get_pricing(uuid)` | Returns price options for a user's shopping list, grouped by ingredient with per-store offers. |
| `get_ingredient_price_details(uuid, uuid, numeric)` | Detailed pricing for a specific ingredient at user's preferred stores. |
| `get_replacement(uuid, grocery_store, text)` | Primary replacement lookup used by manual replacement UI; returns store-scoped offers grouped by matched ingredient. |
| `get_replacement(text, grocery_store)` | Backward-compatible overload for replacement lookup (delegates to 3-arg form). |
| `get_pricing_gaps(uuid)` | Identifies missing ingredient coverage per store. |

### Cost Calculation

| Function | Description |
|----------|-------------|
| `calculate_recipe_cost(uuid, grocery_store, text, integer)` | Total cost of a recipe at a specific store/zip. |
| `calculate_weekly_basket(uuid, jsonb, grocery_store, text)` | Weekly basket cost for multiple recipes minus pantry. |
| `get_best_store_for_plan(uuid, uuid[], text)` | Finds cheapest store for a set of recipes. |

### Unit Conversion

| Function | Description |
|----------|-------------|
| `convert_units(numeric, text, text, uuid)` | Converts between units using conversion table + ingredient-specific weight estimates. |
| `calculate_unit_weight_estimates()` | Infers weight-per-unit from price analysis (comparing weight-sold vs unit-sold products). |
| `scheduled_update_unit_estimates()` | Batch update of weight estimates and default units. |

### Data Maintenance

| Function | Description |
|----------|-------------|
| `fn_relink_product_mappings(boolean, interval)` | Re-runs ingredient matching on product_mappings. Queues low-confidence results. |
| `fn_backfill_resolved_ingredient()` | Backfills resolved ingredient/unit values to `product_mappings`. |
| `fn_backfill_resolved_confidence()` | Backfills resolved unit/quantity confidence values to `product_mappings`. |
| `fn_ingredient_ecosystem(text)` | Backup/restore/reset all ingredient-related tables. |
| `check_pricing_health()` | Diagnostic: unit conversion coverage, data quality, shopping list coverage. |

### Location

| Function | Description |
|----------|-------------|
| `find_stores_near_user(uuid, integer)` | PostGIS query for nearby grocery stores. |
| `fn_sync_user_closest_stores(uuid)` | Refreshes user_preferred_stores from location. |
| `get_closest_stores(float, float, integer)` | Finds closest stores by lat/lng. |

---

## Triggers

### ingredients_recent
| Trigger | Function | Event |
|---------|----------|-------|
| `trg_auto_update_unit_estimates` | fn_auto_update_unit_estimates | INSERT/UPDATE |

### ingredient_match_queue
| Trigger | Function | Event |
|---------|----------|-------|
| `trg_queue_resolved_backfill` | fn_backfill_resolved_ingredient | UPDATE (status → 'resolved') |
| `trg_queue_resolved_confidence_backfill` | fn_backfill_resolved_confidence | UPDATE (status = 'resolved') |

### shopping_list_items
| Trigger | Function | Event |
|---------|----------|-------|
| `a_standardize_manual` | fn_standardize_unit_trigger | INSERT |
| `b_merge_manual` | fn_merge_manual_items | INSERT |
| `c_merge_recipes` | fn_merge_recipe_items | INSERT |
| `trigger_sync_shopping_item_category` | sync_shopping_item_category | INSERT/UPDATE |
| `trigger_track_manual_shopping` | track_manual_item_frequency | INSERT |

### profiles
| Trigger | Function | Event |
|---------|----------|-------|
| `trg_location_hierarchy_sync` | trg_profile_location_changed | UPDATE |
| `trg_refresh_preferred_stores` | fn_sync_profile_from_zip | UPDATE |

### standardized_ingredients
| Trigger | Function | Event |
|---------|----------|-------|
| `trg_normalize_canonical_name` | fn_normalize_canonical_name | INSERT/UPDATE |
| `trg_standardized_ingredients_updated_at` | update_updated_at_column | UPDATE |

### recipe_ingredients
| Trigger | Function | Event |
|---------|----------|-------|
| `trg_recipe_ingredients_autolink` | fn_autolink_standardized_ingredient | INSERT |

### Other
| Table | Trigger | Function |
|-------|---------|----------|
| recipes | update_recipes_modtime | update_modified_column |
| recipe_reviews | tr_update_recipe_ratings, update_recipe_rating_trigger | update_recipe_rating_stats |
| recipe_favorites | tr_log_favorite_analytics | log_recipe_interaction |
| meal_schedule | tr_log_schedule_analytics, trg_meal_schedule_week_index, trigger_meal_activity_snapshot | various |
| manual_shopping_history | tr_auto_link_standardized | fn_link_manual_to_standardized |
| pantry_items | trg_a_pantry_standardize_unit, trg_pantry_items_updated_at | fn_standardize_unit_step, update |
| store_list_history | trg_02_assign_order_id, trg_sync_week_index | fn_assign_store_order_id, fn_ensure_week_index_matches_date |
| waste_analytics | trigger_waste_snapshot | update_waste_snapshot |

---

## Foreign Key Map

```
profiles
  ├── user_preferred_stores.profile_id
  ├── user_analytics_snapshots.user_id
  ├── user_nutrition_history.user_id
  ├── manual_shopping_history.user_id
  └── meal_schedule.user_id

standardized_ingredients
  ├── product_mappings.standardized_ingredient_id
  ├── recipe_ingredients.standardized_ingredient_id
  ├── shopping_list_items.ingredient_id
  ├── ingredient_match_queue.resolved_ingredient_id
  ├── manual_shopping_history.standardized_ingredient_id
  ├── store_list_history.standardized_ingredient_id
  └── waste_analytics.standardized_ingredient_id

product_mappings
  ├── ingredients_history.product_mapping_id
  ├── ingredients_recent.product_mapping_id
  ├── ingredient_match_queue.product_mapping_id
  └── store_list_history.product_mapping_id

grocery_stores
  ├── ingredients_history.grocery_store_id
  ├── ingredients_recent.grocery_store_id
  ├── store_list_history.grocery_store_id
  ├── user_preferred_stores.grocery_store_id
  └── target_404_log.grocery_store_id

recipes
  ├── recipe_ingredients.recipe_id
  ├── recipe_favorites.recipe_id
  ├── recipe_reviews.recipe_id
  ├── recipe_analytics_logs.recipe_id
  ├── meal_schedule.recipe_id
  └── shopping_list_items.recipe_id

unit_canonical
  ├── unit_conversions.from_unit / to_unit
  ├── product_mappings.standardized_unit
  ├── pantry_items.standardized_unit
  ├── standardized_ingredients.default_unit
  └── unit_standardization_map.standard_unit

scraped_zipcodes
  ├── grocery_stores.zip_code
  ├── product_mappings.zip_code
  └── profiles.zip_code
```
