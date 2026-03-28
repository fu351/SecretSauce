# Ollama-Backed Ingredient Remapping Container Plan

## Summary
Add a dedicated Dockerized upstream matching pipeline for ingredient remapping, centered on the ingredient queue worker and Compose wiring for the supporting Ollama/embedding services. The goal is to improve ingredient matching quality by packaging the same current techniques already used in the repo: vector fast-path, vector hinting, semantic dedup, confidence calibration, token IDF, learned sensitivity, and canonical double-check. Canonical consolidation stays available as an optional downstream service, but it is not the primary deliverable because it does not itself use Ollama.

## Key Changes
- Add a new Docker image for the ingredient remapping worker at `docker/Dockerfile.ingredient-remap-worker`, based on `node:20-slim` and shaped like `docker/Dockerfile.embedding-worker`.
- The new image should copy the full runtime surface needed by `backend/orchestrators/ingredient-match-queue-pipeline.ts`: `workers`, `orchestrators`, `standardizer`, `lib/database`, `lib/openai`, `lib/ollama`, `lib/utils`, `scripts`, and root config files needed for TS runtime resolution such as `tsconfig.json` plus package manifests and lockfile.
- Set the default container command to run the one-shot pipeline entrypoint: `node_modules/.bin/tsx backend/orchestrators/ingredient-match-queue-pipeline.ts`
- Update `docker-compose.local.yml` to add a new service such as `ingredient-remap-worker` that:
  loads `.env.local`
  depends on Ollama being healthy when local embeddings are enabled
  exposes the queue worker env contract used by `workers/config.ts`
- Keep `embedding-worker` and `vector-double-check-worker` in Compose as the upstream support services that actually make Ollama useful for remapping quality.
- Keep `canonical-consolidation-worker` in Compose as optional follow-on execution, but document it as a separate stage that should run only after vector double-check data exists.

## Public Interfaces / Runtime Contract
- New repo artifact: `docker/Dockerfile.ingredient-remap-worker`
- New Compose service: `ingredient-remap-worker`
- Required runtime env for the remap worker: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`
- Supported matching env for the remap worker: `QUEUE_BATCH_LIMIT`, `QUEUE_CHUNK_SIZE`, `QUEUE_CHUNK_CONCURRENCY`, `QUEUE_REVIEW_MODE`, `QUEUE_SOURCE`, `QUEUE_ENABLE_UNIT_RESOLUTION`, `QUEUE_STANDARDIZER_CONTEXT`, `DRY_RUN`
- Supported embedding env for the remap worker: `EMBEDDING_OPENAI_MODEL`
- Supported Ollama env for the embedding worker: `EMBEDDING_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://ollama:11434`, `EMBEDDING_OPENAI_MODEL=nomic-embed-text`
- Important implementation note: the current ingredient worker’s vector-match path still uses `lib/openai/embeddings` directly, so this Docker plan assumes:
  Ollama powers the embedding queue and vector discovery services
  OpenAI remains required for the ingredient worker’s live vector lookup unless a later code change adds provider parity there

## Test Plan
- Build the new image locally with Docker and confirm `tsx backend/orchestrators/ingredient-match-queue-pipeline.ts` starts without missing-module errors.
- Run `docker compose -f docker-compose.local.yml up ollama ollama-init embedding-worker` and verify Ollama model bootstrapping plus successful embedding queue processing with `nomic-embed-text`.
- Run the new `ingredient-remap-worker` in `DRY_RUN=true` mode and verify it logs queue startup, vector fast-path or hint usage when embeddings are present, and confidence-calibration plus remap/double-check behavior without write failures.
- Run `vector-double-check-worker` after embeddings exist and verify candidate discovery logs use the same embedding model as the embedding worker.
- Optionally run `canonical-consolidation-worker` in dry-run mode and verify it can consume the remap review data produced upstream.

## Assumptions
- “Remapping workflow” means the upstream ingredient matching pipeline that feeds remap decisions, not consolidation-only execution.
- The deliverable includes both a dedicated Dockerfile and `docker-compose.local.yml` wiring.
- No code changes to the matching algorithm are part of this plan; the plan packages and orchestrates the current techniques already implemented in the repo.
- OpenAI remains part of the ingredient worker runtime for now because the current vector-match implementation has not yet been generalized to use Ollama directly.
- Canonical consolidation remains available in Compose but is treated as a separate optional stage, not the main Ollama-backed worker target.
