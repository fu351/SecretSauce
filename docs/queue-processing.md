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
