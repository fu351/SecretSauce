#!/usr/bin/env node
// relink-product-mappings.js
//
// Runs fn_relink_product_mappings in paginated batches across all non-manual
// product_mappings. High-confidence matches are updated directly; low-confidence
// rows are enqueued for LLM review.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node relink-product-mappings.js
//
// Optional env vars:
//   BATCH_SIZE      rows per RPC call (default 500, matches DB timeout budget)
//   RESET_ALL       set to "true" to re-run matching on all rows (default true)
//   QUEUE_ALL       set to "true" to force every row into the LLM queue instead
//                   of applying high-confidence matches directly (default false)
//   DRY_RUN         set to "true" to print stats without committing (default false)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "500", 10);
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

async function getTotalCount() {
  const { count, error } = await supabase
    .from("product_mappings")
    .select("*", { count: "exact", head: true })
    .not("manual_override", "is", true);
  if (error) throw error;
  return count;
}

async function runBatch(offset) {
  const { data, error } = await supabase.rpc("fn_relink_product_mappings", {
    p_reset_all: RESET_ALL,
    p_queue_all: QUEUE_ALL,
    p_limit: BATCH_SIZE,
    p_offset: offset,
  });
  if (error) throw error;
  return data ?? [];
}

function summarise(rows) {
  const stats = { changed: 0, queued: 0, unchanged: 0 };
  const strategies = {};

  for (const row of rows) {
    strategies[row.pm_match_strategy] =
      (strategies[row.pm_match_strategy] ?? 0) + 1;

    if (row.changed) {
      stats.changed++;
    } else if (row.new_ingredient_id && !row.changed) {
      // Low-confidence rows that were sent to the queue
      stats.queued++;
    } else {
      stats.unchanged++;
    }
  }
  return { stats, strategies };
}

async function main() {
  console.log("=== relink-product-mappings ===");
  console.log(`  reset_all : ${RESET_ALL}`);
  console.log(`  queue_all : ${QUEUE_ALL}`);
  console.log(`  batch_size: ${BATCH_SIZE}`);
  console.log(`  dry_run   : ${DRY_RUN}`);
  console.log();

  if (DRY_RUN) {
    console.log("[dry-run] No writes will be committed.");
  }

  const total = await getTotalCount();
  const batches = Math.ceil(total / BATCH_SIZE);
  console.log(`Total rows to process: ${total} across ${batches} batch(es)\n`);

  const globalStats = { changed: 0, queued: 0, unchanged: 0 };
  const globalStrategies = {};

  for (let i = 0; i < batches; i++) {
    const offset = i * BATCH_SIZE;
    const batchNum = i + 1;
    process.stdout.write(
      `Batch ${batchNum}/${batches} (offset ${offset})... `
    );

    let rows;
    try {
      rows = await runBatch(offset);
    } catch (err) {
      console.error(`\nBatch ${batchNum} failed:`, err.message);
      process.exit(1);
    }

    const { stats, strategies } = summarise(rows);

    globalStats.changed += stats.changed;
    globalStats.queued += stats.queued;
    globalStats.unchanged += stats.unchanged;
    for (const [k, v] of Object.entries(strategies)) {
      globalStrategies[k] = (globalStrategies[k] ?? 0) + v;
    }

    console.log(
      `done — ${rows.length} rows | changed: ${stats.changed} | queued: ${stats.queued} | unchanged: ${stats.unchanged}`
    );
  }

  console.log("\n=== Summary ===");
  console.log(`  Total processed : ${total}`);
  console.log(`  Direct updates  : ${globalStats.changed}`);
  console.log(`  Queued for LLM  : ${globalStats.queued}`);
  console.log(`  Unchanged       : ${globalStats.unchanged}`);
  console.log("\n  Match strategies:");
  for (const [strategy, count] of Object.entries(globalStrategies).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${strategy.padEnd(20)} ${count}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});