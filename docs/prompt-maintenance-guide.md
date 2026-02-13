# Prompt Maintenance Guide

## Agent Metadata

- `Doc Kind`: `operations-guide`
- `Canonicality`: `implementation-guide`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `lib/prompts/`, `lib/ingredient-standardizer.ts`, `lib/unit-standardizer.ts`, `queue/worker/processor.ts`
- `Update Trigger`: Prompt contracts, queue prompt consumers, or rollout flags change.

## Agent Use

- `Read this when`: modifying ingredient/unit prompt templates or output contracts.
- `Stop reading when`: changes are outside prompt/runtime integration.
- `Escalate to`: `docs/ingredient-queue-realtime-plan.md`, `docs/scripts-directory.md`.


## Purpose

This guide describes where to edit queue standardization prompts and how changes flow into the worker.

## Prompt Families

- Ingredient prompt:
  - `lib/prompts/ingredient-standardizer/build-prompt.ts`
  - `lib/prompts/ingredient-standardizer/sections.ts`
- Unit prompt:
  - `lib/prompts/unit-standardizer/build-prompt.ts`
  - `lib/prompts/unit-standardizer/sections.ts`
- Shared prompt helpers:
  - `lib/prompts/shared/json-output.ts`

## Runtime Consumers

- Ingredient runtime:
  - `lib/ingredient-standardizer.ts`
- Unit runtime:
  - `lib/unit-standardizer.ts`
- Queue routing:
  - `queue/worker/processor.ts`

## Rollout Flags

- `QUEUE_ENABLE_UNIT_RESOLUTION` (default `false`)
- `QUEUE_UNIT_DRY_RUN` (default `true`)
- `QUEUE_UNIT_MIN_CONFIDENCE` (default `0.75`)

Keep nightly workflow defaults unchanged (`QUEUE_REVIEW_MODE=ingredient`, `QUEUE_SOURCE=scraper`) until unit quality is validated.

## Editing Rules

1. Keep output contracts stable:
   - Ingredient: `id`, `canonicalName`, `category`, `confidence`
   - Unit: `id`, `resolvedUnit`, `resolvedQuantity`, `confidence`, `status`, `error?`
2. Keep JSON-only output instructions explicit.
3. Update/add tests when changing prompt output structure:
   - `lib/prompts/unit-standardizer/build-prompt.test.ts`
   - `lib/unit-standardizer.test.ts`
