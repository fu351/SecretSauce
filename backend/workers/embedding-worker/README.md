# Embedding Worker

Processes rows from `embedding_queue`, generates embeddings, and writes them to `recipe_embeddings` or `ingredient_embeddings`.

## Overview

- Claims pending queue rows with lease semantics.
- Requeues expired processing rows before each cycle.
- Fetches embeddings from Ollama.
- Upserts the embedding into the matching destination table.
- Marks the queue row `completed` or `failed`.
- Supports `dryRun` mode for previewing rows without writing embeddings.

## Key Files

- `backend/orchestrators/embedding-queue-pipeline/pipeline.ts` - one-shot pipeline entrypoint used by the root script alias and workflow runs.
- `config.ts` - reads worker config from environment variables.
- `processor.ts` - does the queue claim, embedding fetch, upsert, and status updates.
- `runner.ts` - continuous loop wrapper around the processor.
- `embedding-queue-db.ts` - worker-scoped queue and embedding table data access.
- `ollama-embeddings.ts` - worker-scoped Ollama embedding client.
- `__tests__/processor.test.ts` - Vitest coverage for the main processing paths.

## Run Instructions

One-shot resolver:

```bash
npm run embedding-queue-pipeline
```

The shared `backend/scripts` package also exposes the same entrypoint via `npm --prefix backend/scripts run embedding-queue-pipeline`.

Local Docker worker:

```bash
docker compose -f docker-compose.local.yml run --rm embedding-worker
```

Continuous loop:

```bash
npm run embedding-queue-pipeline-runner
```

The loop runner lives in `backend/orchestrators/embedding-queue-pipeline/runner.ts`.

## Required Env Vars

Required for Supabase access:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Embedding settings:

- `EMBEDDING_OPENAI_MODEL` - defaults to `nomic-embed-text`
- `OLLAMA_BASE_URL` - defaults to `http://localhost:11434`
- `EMBEDDING_WORKER_REQUEST_TIMEOUT_MS` - defaults to `30000`

Queue behavior:

- `EMBEDDING_QUEUE_RESOLVER_NAME` - defaults to `embedding-queue-pipeline`
- `EMBEDDING_QUEUE_BATCH_LIMIT` - defaults to `50`
- `EMBEDDING_QUEUE_MAX_CYCLES` - defaults to `0` for no limit in the resolver
- `EMBEDDING_QUEUE_LEASE_SECONDS` - defaults to `180`
- `EMBEDDING_WORKER_INTERVAL_SECONDS` - defaults to `300`
- `EMBEDDING_QUEUE_REQUEUE_LIMIT` - defaults to `500`
- `EMBEDDING_WORKER_SOURCE_TYPE` - `recipe`, `ingredient`, or `any`
- `EMBEDDING_DRY_RUN` - defaults to `false`

## Processing Flow

1. Load config from env.
2. Requeue expired processing rows unless `dryRun` is enabled.
3. Claim up to `batchLimit` pending rows, filtered by `sourceType`.
4. In `dryRun`, return previews only and do not call Ollama.
5. Otherwise, fetch embeddings in one batch from Ollama.
6. For each row, upsert to `recipe_embeddings` when `source_type = recipe`, upsert to `ingredient_embeddings` when `source_type = ingredient`, then mark the queue row completed.
7. If a row write fails, mark that row failed with the error message.
8. If the batch request fails, mark all claimed rows failed.

## Testing

Run the worker tests:

```bash
npm run test:run -- backend/workers/embedding-worker/__tests__/processor.test.ts
```

The test file covers dry-run previews, successful embedding writes, per-row failures, and batch request failures.
