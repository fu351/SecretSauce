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

async function getTotalCount() {
  const { count, error } = await supabase
    .from("product_mappings")
    .select("*", { count: "exact", head: true })
    .not("manual_override", "is", true);
  if (error) throw error;
  return count;
}

function isStatementTimeoutError(err) {
  const text = String(err?.message ?? err ?? "");
  return /57014/.test(text) && /statement timeout/i.test(text);
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function buildBatchSignature(payload) {
  const rows = extractRows(payload);
  if (!rows.length) return null;

  const ids = rows
    .map((row) => row?.id ?? row?.product_mapping_id ?? row?.row_id ?? null)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value));

  return ids.length > 0 ? ids.join(",") : null;
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
    console.log(
      "[dry-run] Read-only mode: skipping fn_relink_product_mappings because the RPC mutates rows directly."
    );
  }

  const total = await getTotalCount();
  console.log(`Total rows to process: ${total}\n`);

  if (DRY_RUN) {
    console.log(`Would process head batches of up to ${BATCH_SIZE} rows until the candidate set is exhausted.`);
    return;
  }

  const globalStats = { changed: 0, queued: 0, unchanged: 0 };
  const globalStrategies = {};
  let totalProcessed = 0;

  let currentBatchSize = BATCH_SIZE;
  let batchNum = 1;
  let previousBatchSignature = null;

  while (true) {
    process.stdout.write(
      `Batch ${batchNum} (head batch, size ${currentBatchSize})... `
    );

    let rows;
    try {
      const { data, error } = await supabase.rpc("fn_relink_product_mappings", {
        p_reset_all: RESET_ALL,
        p_queue_all: QUEUE_ALL,
        p_limit: currentBatchSize,
        p_offset: 0,
      });
      if (error) throw error;
      rows = data ?? [];
    } catch (err) {
      if (isStatementTimeoutError(err) && currentBatchSize > MIN_BATCH_SIZE) {
        const nextBatchSize = Math.max(MIN_BATCH_SIZE, Math.floor(currentBatchSize / 2));
        console.log(`timed out; retrying with batch size ${nextBatchSize}`);
        currentBatchSize = nextBatchSize;
        continue;
      }
      console.error(`\nBatch ${batchNum} failed:`, err.message);
      process.exit(1);
    }

    const batchSignature = buildBatchSignature(rows);
    const { stats, strategies } = summarise(rows);

    totalProcessed += extractRows(rows).length;
    globalStats.changed += stats.changed;
    globalStats.queued += stats.queued;
    globalStats.unchanged += stats.unchanged;
    for (const [k, v] of Object.entries(strategies)) {
      globalStrategies[k] = (globalStrategies[k] ?? 0) + v;
    }

    console.log(
      `done — ${extractRows(rows).length} rows | changed: ${stats.changed} | queued: ${stats.queued} | unchanged: ${stats.unchanged}`
    );

    const batchRowCount = extractRows(rows).length;
    if (batchRowCount === 0 || batchRowCount < currentBatchSize) {
      break;
    }

    if (batchSignature && previousBatchSignature === batchSignature) {
      console.error(
        `Batch ${batchNum} repeated the same head batch without shrinking the candidate set; aborting to avoid looping forever.`
      );
      process.exit(1);
    }

    previousBatchSignature = batchSignature;
    batchNum += 1;
  }

  console.log("\n=== Summary ===");
  console.log(`  Initial eligible: ${total}`);
  console.log(`  Total processed : ${totalProcessed}`);
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
