#!/usr/bin/env node
// relink-product-mappings.js
//
// Relinks product_mappings to standardized_ingredients in three phases:
//
//   Phase 1 – Populate cache
//     Runs fn_match_ingredient for every eligible non-manual product_mapping
//     and writes the result to product_mapping_relink_cache.  No rows in
//     product_mappings or ingredient_match_queue are touched.
//
//   Phase 2 – Create ingredients
//     For any cache entry that has a proposed canonical name but no resolved
//     ingredient UUID, upserts the row into standardized_ingredients and wires
//     the UUID back into the cache.  Currently a no-op for the fuzzy-match
//     path (fn_match_ingredient always returns an existing UUID for trusted
//     strategies), but handles future cases where phase 1 produces new
//     canonical names.
//
//   Phase 3 – Apply cache
//     Reads the cached decisions and writes to product_mappings (direct updates
//     with calibrated confidence) or ingredient_match_queue (queued rows).
//
// When DRY_RUN=true phases 2 and 3 are skipped; the cache is populated so you
// can inspect product_mapping_relink_cache to preview what would happen.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node relink-product-mappings.js
//
// Optional env vars:
//   BATCH_SIZE   rows per RPC call (default 500, matches DB timeout budget)
//   RESET_ALL    re-run matching on all rows (default true)
//   QUEUE_ALL    force every row into the LLM queue (default false)
//   DRY_RUN      populate cache only; skip phases 2 & 3 (default false)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "500", 10);
const MIN_BATCH_SIZE = 25;
const RESET_ALL = (process.env.RESET_ALL ?? "true") === "true";
const QUEUE_ALL = (process.env.QUEUE_ALL ?? "false") === "true";
const DRY_RUN = (process.env.DRY_RUN ?? "false") === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function isStatementTimeoutError(err) {
  const text = String(err?.message ?? err ?? "");
  return /57014/.test(text) && /statement timeout/i.test(text);
}

async function getTotalProductMappingCount() {
  const { count, error } = await supabase
    .from("product_mappings")
    .select("*", { count: "exact", head: true })
    .not("manual_override", "is", true);
  if (error) throw error;
  return count ?? 0;
}

// ─── Phase 1: populate cache ──────────────────────────────────────────────────

async function phase1PopulateCache(total) {
  console.log("── Phase 1: Populate cache ──────────────────────────────────");
  console.log(`  Eligible rows: ${total}`);

  const stats = { direct: 0, queued: 0 };
  const strategies = {};
  let batchNum = 1;
  let offset = 0;
  let currentBatchSize = BATCH_SIZE;

  while (offset < total) {
    process.stdout.write(
      `  Batch ${batchNum} (offset ${offset}, size ${currentBatchSize})... `
    );

    let rows;
    try {
      const { data, error } = await supabase.rpc("fn_populate_relink_cache", {
        p_reset_all:  RESET_ALL,
        p_queue_all:  QUEUE_ALL,
        p_limit:      currentBatchSize,
        p_offset:     offset,
      });
      if (error) throw error;
      rows = data ?? [];
    } catch (err) {
      if (isStatementTimeoutError(err) && currentBatchSize > MIN_BATCH_SIZE) {
        const next = Math.max(MIN_BATCH_SIZE, Math.floor(currentBatchSize / 2));
        console.log(`timed out; retrying with batch size ${next}`);
        currentBatchSize = next;
        continue;
      }
      console.error(`\n  Batch ${batchNum} failed:`, err.message);
      process.exit(1);
    }

    for (const row of rows) {
      strategies[row.match_strategy] = (strategies[row.match_strategy] ?? 0) + 1;
      if (row.needs_queue) {
        stats.queued++;
      } else {
        stats.direct++;
      }
    }

    console.log(
      `done — ${rows.length} rows | direct: ${rows.filter((r) => !r.needs_queue).length} | queued: ${rows.filter((r) => r.needs_queue).length}`
    );

    if (rows.length === 0 || rows.length < currentBatchSize) break;

    offset += rows.length;
    batchNum++;
  }

  console.log(`\n  Cached: ${stats.direct + stats.queued} rows`);
  console.log(`    Would direct-link : ${stats.direct}`);
  console.log(`    Would queue (LLM) : ${stats.queued}`);
  console.log("  Match strategies:");
  for (const [strategy, count] of Object.entries(strategies).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${strategy.padEnd(20)} ${count}`);
  }

  return stats;
}

// ─── Phase 2: create ingredients ──────────────────────────────────────────────

async function phase2CreateIngredients() {
  console.log("\n── Phase 2: Create ingredients ──────────────────────────────");

  const { data, error } = await supabase.rpc("fn_create_relink_ingredients");
  if (error) {
    console.error("  Failed:", error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  const created = rows.filter((r) => r.was_created).length;
  const wired   = rows.filter((r) => !r.was_created).length;

  if (rows.length === 0) {
    console.log("  No missing ingredients (expected for fuzzy-match path).");
  } else {
    console.log(`  Created : ${created}`);
    console.log(`  Wired   : ${wired}`);
    for (const row of rows.filter((r) => r.was_created)) {
      console.log(`    + ${row.canonical_name} (${row.ingredient_id})`);
    }
  }

  return { created, wired };
}

// ─── Phase 3: apply cache ─────────────────────────────────────────────────────

async function phase3ApplyCache() {
  console.log("\n── Phase 3: Apply cache ─────────────────────────────────────");

  const stats = { changed: 0, queued: 0, unchanged: 0 };
  const strategies = {};
  let batchNum = 1;
  let currentBatchSize = BATCH_SIZE;

  while (true) {
    process.stdout.write(
      `  Batch ${batchNum} (size ${currentBatchSize})... `
    );

    let rows;
    try {
      const { data, error } = await supabase.rpc("fn_apply_relink_cache", {
        p_limit: currentBatchSize,
      });
      if (error) throw error;
      rows = data ?? [];
    } catch (err) {
      if (isStatementTimeoutError(err) && currentBatchSize > MIN_BATCH_SIZE) {
        const next = Math.max(MIN_BATCH_SIZE, Math.floor(currentBatchSize / 2));
        console.log(`timed out; retrying with batch size ${next}`);
        currentBatchSize = next;
        continue;
      }
      console.error(`\n  Batch ${batchNum} failed:`, err.message);
      process.exit(1);
    }

    if (rows.length === 0) break;

    for (const row of rows) {
      strategies[row.match_strategy] = (strategies[row.match_strategy] ?? 0) + 1;
      if (row.changed)      stats.changed++;
      else if (row.queued)  stats.queued++;
      else                  stats.unchanged++;
    }

    console.log(
      `done — ${rows.length} rows | updated: ${rows.filter((r) => r.changed).length} | queued: ${rows.filter((r) => r.queued).length} | unchanged: ${rows.filter((r) => !r.changed && !r.queued).length}`
    );

    if (rows.length < currentBatchSize) break;

    batchNum++;
  }

  console.log(`\n  Direct updates  : ${stats.changed}`);
  console.log(`  Queued for LLM  : ${stats.queued}`);
  console.log(`  Unchanged       : ${stats.unchanged}`);
  console.log("  Match strategies:");
  for (const [strategy, count] of Object.entries(strategies).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${strategy.padEnd(20)} ${count}`);
  }

  return stats;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== relink-product-mappings ===");
  console.log(`  reset_all : ${RESET_ALL}`);
  console.log(`  queue_all : ${QUEUE_ALL}`);
  console.log(`  batch_size: ${BATCH_SIZE}`);
  console.log(`  dry_run   : ${DRY_RUN}`);
  console.log();

  const total = await getTotalProductMappingCount();

  // Phase 1 always runs (even in dry-run: populates the cache for inspection)
  await phase1PopulateCache(total);

  if (DRY_RUN) {
    console.log(
      "\n[dry-run] Phases 2 & 3 skipped. Inspect product_mapping_relink_cache to preview changes."
    );
    return;
  }

  await phase2CreateIngredients();
  await phase3ApplyCache();

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
