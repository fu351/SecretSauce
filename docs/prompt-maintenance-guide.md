# Prompt Maintenance Guide

## Agent Metadata

- `Doc Kind`: `operations-guide`
- `Canonicality`: `implementation-guide`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-19`
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
  - `scripts/utils/canonical-matching.ts`

## Rollout Flags

- `QUEUE_ENABLE_UNIT_RESOLUTION` (default `true`)
- `QUEUE_UNIT_DRY_RUN` (defaults to `DRY_RUN`; typically `false` for normal runs, `true` for dry runs)
- `QUEUE_UNIT_MIN_CONFIDENCE` (default `0.75`)

Canonical double-check thresholds are currently hard-coded in runtime config:

- `doubleCheckMinConfidence=0.85`
- `doubleCheckMinSimilarity=0.96`

Nightly workflow defaults stay source/review scoped (`QUEUE_REVIEW_MODE=ingredient`, `QUEUE_SOURCE=scraper`) while unit resolution is enabled by default.

## Current Ingredient Prompt Baseline

- Prompt version: `ingredient-v3` in `lib/prompts/ingredient-standardizer/build-prompt.ts`
- Key normalization intent:
  - prioritize matching existing canonical names
  - reject full retail product title outputs for `canonicalName`
  - keep canonical names concise (typically `1-4` words)
  - strip brand, packaging/count, and year/vintage-like noise
- Context guidance source:
  - `lib/utils/ingredient-standardizer-context.ts`
  - recipe context remains stricter than pantry context

## Matching + Queue Guardrails

Prompt changes alone are not relied on for safety. Queue runtime adds independent safeguards:

- Canonical similarity scoring:
  - `scripts/utils/canonical-matching.ts`
  - weighted lexical + containment scoring with reduced order sensitivity
  - modifier-conflict penalty for generic head nouns (e.g., `hoisin sauce` vs `hot sauce`)
- Queue remap policies:
  - cross-category remaps are heavily penalized and gated
  - asymmetric policy: generic -> specific and specific -> generic remaps require stricter confidence/similarity
- New-canonical creation gate:
  - long/noisy candidate names can be blocked from `getOrCreate`
  - blocked rows surface as queue failures for follow-up/remap
- New-canonical probation:
  - first creation is held until repeated evidence from distinct source signatures
  - tracked via `canonical_creation_probation_events`
- Outcome-driven confidence calibration:
  - accepted/rejected outcomes are logged to `ingredient_confidence_outcomes`
  - worker calibrates raw model confidence against empirical acceptance bins
- Drift-learned variety retention:
  - sensitive head/modifier tokens are learned from canonical drift telemetry
  - replaces static modifier list maintenance
- Category enum write guard:
  - invalid model category values are not allowed to break inserts
  - invalid `item_category_enum` values retry with fallback category `other`
  - valid enum values are preserved as-is
- Blocked-canonical fallback behavior:
  - when blocked, worker may recover only to existing canonicals via deterministic tail-token candidates
  - `best_fuzzy_match` is intentionally not used for this recovery

## Editing Rules

1. Keep output contracts stable:
   - Ingredient: `id`, `canonicalName`, `category`, `confidence`
   - Unit: `id`, `resolvedUnit`, `resolvedQuantity`, `confidence`, `status`, `error?`
2. Keep JSON-only output instructions explicit.
3. Update/add tests when changing prompt output structure:
   - `lib/prompts/unit-standardizer/build-prompt.test.ts`
   - `lib/unit-standardizer.test.ts`
4. When changing ingredient prompt policy, verify corresponding runtime guards still align:
   - `queue/worker/processor.ts`
   - `scripts/utils/canonical-matching.ts`
