# Queue Processing Architecture

## Atomic Claiming with Lease-Based Locking

The `claim_ingredient_match_queue` RPC (defined in [migration 0011](../supabase/migrations/0011_queue_realtime_foundation.sql)) provides safe concurrent queue processing.

### Race Condition Protection

1. **Row-level locking**: `FOR UPDATE SKIP LOCKED` ensures each worker gets exclusive rows
   - If another transaction holds a row, it's skipped (not blocked)
   - Prevents duplicate processing even with concurrent workflow runs
   - PostgreSQL manages locks automatically across distributed workers

2. **Lease expiry handling**: Workers can reclaim abandoned rows
   - Default lease duration: 180 seconds (configurable via `p_lease_seconds`)
   - If worker crashes, lease expires and row becomes claimable again
   - RPC automatically reclaims expired leases: `status='processing' AND lease_expires <= now()`
   - Companion function `requeue_expired_ingredient_match_queue` can manually reset stuck rows

3. **Atomic updates**: CTE pattern ensures claim + update is single transaction
   - `WITH claimable AS (SELECT ... FOR UPDATE SKIP LOCKED)`
   - `UPDATE ... FROM claimable WHERE q.id = c.id RETURNING q.*`
   - No gap between SELECT and UPDATE where race conditions could occur

4. **Attempt tracking**: `attempt_count` increments on each claim
   - Useful for detecting infinite retry loops
   - Currently unbounded - future enhancement: add `max_attempts` circuit breaker
   - Can query `attempt_count > 5` to find problematic rows

### Workflow Retry Logic

The workflow's `retry_failed()` function manually resets failed rows to pending:
- Explicitly clears lease metadata (`processing_lease_expires_at = null`)
- Clears resolver tracking (`resolved_by = null`, `resolved_at = null`)
- Sets informative error message for audit trail: `"Retry requested by nightly workflow"`

This is safe because:
- Failed rows have already completed processing (status='failed', no active lease)
- The manual reset is intentional (user requested retry via `QUEUE_RETRY_FAILED=true`)
- Next claim cycle will pick them up via normal pending query

### Indexes

Three indexes optimize claim queries (see migration 0011):
1. `idx_match_queue_claim_window (status, processing_lease_expires_at, created_at)`
2. `idx_match_queue_processing_lease_expires (processing_lease_expires_at) WHERE status='processing'`
3. `idx_match_queue_source_claim_window (source, status, processing_lease_expires_at, created_at)`

These support:
- Efficient pending/expired lease lookups
- Source-filtered claims (`p_source = 'scraper'`)
- Oldest-first FIFO ordering (`ORDER BY created_at ASC`)

## Canonical Resolution Safeguards

The queue resolver now applies multiple safety layers before writing canonical ingredients:

1. Similarity + candidate collection:
   - Candidate search includes normalized terms and tail noun terms.
   - Shared scorer lives in `scripts/utils/canonical-matching.ts`.

2. Cross-category remap protection:
   - Cross-category candidate scores are strongly penalized.
   - Cross-category remaps must clear stricter confidence/similarity requirements.

3. Asymmetric remap policy:
   - Generic -> specific remaps are held to stricter thresholds.
   - Lateral and specific -> generic remaps use baseline thresholds unless blocked by other rules.

4. Modifier-conflict protection:
   - Generic head nouns with conflicting modifiers are penalized
     (example class: `hoisin sauce` vs `hot sauce`).
   - Phrase/position bonuses only apply when there are enough shared tokens.

5. New-canonical creation gate:
   - If canonical does not already exist, long/noisy/low-confidence names can be blocked from creation.
   - This prevents raw retail product titles from being inserted into `standardized_ingredients`.
   - Blocked rows are surfaced as queue failures for follow-up or remap workflows.

6. Invalid category enum safeguard:
   - `standardized_ingredients` inserts guard `item_category_enum` values.
   - If the model emits an invalid category string (example: `"pasta"`), insert retries with category `"other"`.
   - Valid enum categories are not changed.

7. Blocked-canonical recovery (non-fuzzy):
   - If a new canonical is blocked, the worker attempts deterministic fallback candidates using tail tokens.
   - Fallback is accepted only when the candidate already exists in `standardized_ingredients`.
   - `best_fuzzy_match` is intentionally not used for this recovery path.

## Drift Telemetry (DB-Side Feedback Loop)

Canonical double-check pair outcomes are now aggregated daily in Postgres:

- Table: `public.canonical_double_check_daily_stats`
- Logging RPC: `public.fn_log_canonical_double_check_daily(...)`
- Analytics view: `public.v_canonical_double_check_drift_daily`

Worker behavior:

- Remapped pairs are logged as `decision='remapped'`.
- Skipped pairs are logged as `decision='skipped'` with explicit reasons
  (e.g., `cross_category_mismatch`, `asymmetric_lateral`, `below_similarity_threshold`).
- Aggregation key is daily and pair-based, so repeated drift patterns are easy to rank.

Useful tuning query:

```sql
select
  event_date,
  source_canonical,
  target_canonical,
  decision,
  reason,
  direction,
  event_count,
  avg_similarity,
  avg_ai_confidence
from public.v_canonical_double_check_drift_daily
where event_date >= (current_date - interval '14 days')
order by event_count desc, avg_similarity desc
limit 200;
```

## Queue Drift Stress Dataset

For reliability testing of queue resolver behavior against noisy retail strings:

- Source file: `lib/dev/mock-recipes.ts`
- Generated set: `QUEUE_DRIFT_MOCK_RECIPES`
- Default volume: `72` synthetic recipes
- Stress pool includes:
  - long/brand-heavy product titles
  - sauce and beverage ambiguity pairs
  - deli/meat/hot-dog variants
  - packaging/count/unit noise
  - selected non-food lookalikes for rejection behavior

Seeding path:

- Script: `scripts/seed-mock-recipes.ts`
- The stress set is appended to `MOCK_RECIPES` before upsert.
