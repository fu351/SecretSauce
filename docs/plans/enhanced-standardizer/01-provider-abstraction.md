## Phase 1 - Provider Abstraction
**Executor: Codex. No database access required.**

**Risk: Low. No matching logic changes. Pure structure.**

### Goal
Decouple the current standardizer worker from its direct OpenAI dependency so providers can be swapped, shadowed, and measured independently. This is a prerequisite for the local Qwen migration already planned in the realtime queue plan.

The abstraction must wrap the real current API shape:

```ts
runStandardizerProcessor({
  mode: 'ingredient',
  inputs,
  context,
})

runStandardizerProcessor({
  mode: 'unit',
  inputs,
})
```

The API route also has a direct dependency on `standardizeIngredientsWithAI()`, so Phase 1 updates both call paths rather than assuming every caller already goes through `runStandardizerProcessor()`.

### Interface

```ts
// backend/workers/standardizer-worker/provider.ts

export interface StandardizerProvider {
  readonly name: string
  readonly model: string

  standardizeIngredients(
    items: StandardizerInput[],
    opts: StandardizerOptions
  ): Promise<StandardizerResult[]>

  standardizeUnits(
    items: UnitStandardizerInput[]
  ): Promise<UnitStandardizerResult[]>
}

export interface StandardizerOptions {
  context: 'scraper' | 'recipe' | 'pantry'
  hintCandidates?: string[]
  canonicalSample?: string[]
}
```

Implementation note: `OpenAIProvider` is an adapter over the existing `standardizeIngredientsWithAI()` and `standardizeUnitsWithAI()` functions. It should preserve the current result arrays and summaries when used through `runStandardizerProcessor()`.

### Implementations

```ts
// backend/workers/standardizer-worker/providers/openai-provider.ts
// Wraps current OpenAI standardizer functions exactly as-is.
// No behavior change - just moves them behind the interface.

// backend/workers/standardizer-worker/providers/ollama-provider.ts
// OpenAI-compatible HTTP client pointed at LOCAL_LLM_BASE_URL.
// Same JSON output contract as OpenAI provider.
// Used initially for shadow mode only.

// backend/workers/standardizer-worker/providers/deterministic-provider.ts
// Stub now. Filled out in Phase 6.
// Returns null results - signals "needs_review".
```

### Routing

```ts
// backend/workers/standardizer-worker/provider-router.ts

export function getActiveProvider(): StandardizerProvider {
  const name = process.env.STANDARDIZER_PROVIDER ?? 'openai'
  switch (name) {
    case 'openai': return new OpenAIProvider()
    case 'ollama': return new OllamaProvider()
    case 'deterministic': return new DeterministicProvider()
    default: throw new Error(`Unknown STANDARDIZER_PROVIDER: ${name}`)
  }
}

export function getShadowProvider(): StandardizerProvider | null {
  const name = process.env.STANDARDIZER_SHADOW_PROVIDER
  if (!name) return null
  return name === 'ollama' ? new OllamaProvider() : null
}
```

### Files Changed
- New: `backend/workers/standardizer-worker/provider.ts`, `providers/openai-provider.ts`, `providers/ollama-provider.ts`, `providers/deterministic-provider.ts`, `provider-router.ts`
- Modified: `backend/workers/standardizer-worker/processor.ts` - route `mode: 'ingredient'` and `mode: 'unit'` jobs through the active provider while preserving the current processor result contract
- Modified: `backend/workers/ingredient-worker/processor.ts` - no direct provider logic unless the resolver needs shadow metadata; keep its current `runStandardizerProcessor({ mode, inputs, context })` call shape stable
- Modified: `app/api/ingredients/standardize/route.ts` - replace direct `standardizeIngredientsWithAI()` usage with the provider-backed path, confirmed no contract change

### Definition of Done
- Queue worker runs identically with `STANDARDIZER_PROVIDER=openai`
- `app/api/ingredients/standardize/route.ts` passes existing tests unchanged
- `backend/workers/standardizer-worker/processor.ts` keeps the existing discriminated job/result API
- Shadow provider can be enabled without any primary-path code changes
