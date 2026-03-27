# Standardizer Worker

Shared ingredient and unit standardization module used by queue workers and the pantry standardization API.

## Key Files

- `index.ts` - public exports for ingredient + unit standardization helpers.
- `processor.ts` - worker-style processor entrypoint for ingredient/unit standardization jobs.
- `runner.ts` - worker-style loop runner for processor jobs.
- `utils.ts` - shared summary helpers used by the processor.
- `ingredient-standardizer.ts` - ingredient canonicalization with context rules (`recipe` vs `pantry`).
- `unit-standardizer.ts` - unit normalization and parsing for scraper/recipe rows.
- `prompts/ingredient/*` - ingredient prompt builder and sections.
- `prompts/unit/*` - unit prompt builder and sections.

## Usage

Import from:

- `@/backend/workers/standardizer-worker` (app/lib imports)
- `../standardizer-worker` (from worker siblings)

## Environment

- `OPENAI_API_KEY` (required for AI standardization calls)
- `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)
- `STANDARDIZER_RUNNER_MODE` (`ingredient` or `unit`) for `runner.ts` execution
- `STANDARDIZER_RUNNER_INPUTS_JSON` (JSON array payload for runner execution)
- `STANDARDIZER_RUNNER_CONTEXT` (optional context for ingredient mode)
- `STANDARDIZER_RUNNER_MAX_CYCLES` and `STANDARDIZER_WORKER_INTERVAL_SECONDS` (runner loop controls)

## Tests

- `backend/workers/standardizer-worker/__tests__/unit-standardizer.test.ts`
- `backend/workers/standardizer-worker/__tests__/build-prompt.test.ts`
- `backend/workers/standardizer-worker/__tests__/processor.test.ts`
- `backend/workers/standardizer-worker/__tests__/runner.test.ts`
- `backend/workers/standardizer-worker/__tests__/utils.test.ts`
