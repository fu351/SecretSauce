# Standardizer Worker

Shared ingredient and unit standardization module used by queue workers and the pantry standardization API.

## Key Files

- `index.ts` - public exports for ingredient + unit standardization helpers.
- `processor.ts` - worker-style processor entrypoint for ingredient/unit standardization jobs.
- `runner.ts` - worker-style loop runner for processor jobs.
- `utils.ts` - shared summary helpers used by the processor.
- `ingredient-standardizer.ts` - ingredient canonicalization with context rules (`recipe`, `pantry`, `scraper`).
- `unit-standardizer.ts` - unit normalization and parsing for scraper/recipe rows.
- `prompts/ingredient/*` - ingredient prompt builder and sections.
- `prompts/unit/*` - unit prompt builder and sections.

## Usage

Import from:

- `@/backend/workers/standardizer-worker` (app/lib imports)
- `../standardizer-worker` (from worker siblings)

## Environment

- `LLM_BASE_URL` - OpenAI-compatible chat endpoint, defaults to `https://api.openai.com` when unset. For local Gemma via Ollama, use `http://ollama-gemma:11434` in Compose or `http://localhost:11435` from your host.
- `LLM_MODEL` - chat model name, defaults to `gemma3:4b`
- `LLM_API_KEY` - optional bearer token for hosted OpenAI-compatible endpoints
- `OPENAI_API_KEY` and `OPENAI_MODEL` are still honored as fallbacks for compatibility
- `STANDARDIZER_RUNNER_MODE` (`ingredient` or `unit`) for `runner.ts` execution
- `STANDARDIZER_RUNNER_INPUTS_JSON` (JSON array payload for runner execution)
- `STANDARDIZER_RUNNER_CONTEXT` (optional context for ingredient mode: `recipe`, `pantry`, or `scraper`)
- `STANDARDIZER_RUNNER_MAX_CYCLES` and `STANDARDIZER_WORKER_INTERVAL_SECONDS` (runner loop controls)

## Tests

- `backend/workers/standardizer-worker/__tests__/unit-standardizer.test.ts`
- `backend/workers/standardizer-worker/__tests__/build-prompt.test.ts`
- `backend/workers/standardizer-worker/__tests__/processor.test.ts`
- `backend/workers/standardizer-worker/__tests__/runner.test.ts`
- `backend/workers/standardizer-worker/__tests__/utils.test.ts`
