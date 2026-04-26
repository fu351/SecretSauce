## Phase 6 â€” Deterministic Canonical Builder
**Risk: Medium. Runs before LLM. Wrong rules cause false auto-resolves.**

### Goal
A pure function that takes a `cleanedName` and produces a canonical name without an LLM call. It handles the common cases where the LLM is doing straightforward normalization (strip brand/packaging/descriptor noise, apply form/variety rules) rather than genuine semantic reasoning. It does **not** create new canonicals â€” it only maps to existing ones.

The key constraint from the critique: this function calls the existing `maybeRetainFormSpecificCanonical()` and `maybeRetainVarietyCanonical()` rather than reimplementing their logic. This avoids the token rule conflict problem.

### Token Rule Table (DB-Backed, Not Hardcoded)

Rather than hardcoding a flat list in TypeScript, rules live in a DB table so they can be updated without a code deploy:

```sql
-- supabase/migrations/0017_canonical_builder_rules.sql

create type token_rule_action as enum ('drop', 'preserve', 'preserve_pair');

create table canonical_builder_rules (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  action token_rule_action not null,
  paired_with text,           -- for preserve_pair: both tokens must be present
  priority integer not null default 0,  -- higher priority wins conflicts
  notes text,
  created_at timestamptz not null default now(),
  unique (token, action, paired_with)
);

-- Seed rules
insert into canonical_builder_rules (token, action, priority, notes) values
  -- Drop: pure descriptor noise
  ('organic', 'drop', 0, 'never meaningful for canonical'),
  ('fresh', 'drop', 0, NULL),
  ('frozen', 'drop', 0, NULL),
  ('unsalted', 'drop', 0, NULL),
  ('roasted', 'drop', 0, NULL),
  ('low-fat', 'drop', 0, NULL),
  ('reduced-fat', 'drop', 0, NULL),
  ('large', 'drop', 0, NULL),
  ('small', 'drop', 0, NULL),
  ('medium', 'drop', 0, NULL),
  -- Drop: packaging
  ('bag', 'drop', 0, NULL),
  ('box', 'drop', 0, NULL),
  ('can', 'drop', 0, NULL),
  ('jar', 'drop', 0, NULL),
  ('pack', 'drop', 0, NULL),
  ('bottle', 'drop', 0, NULL),
  -- Preserve: forms (high priority â€” never dropped)
  ('paste', 'preserve', 10, 'tomato paste â‰  tomato'),
  ('sauce', 'preserve', 10, NULL),
  ('flour', 'preserve', 10, NULL),
  ('oil', 'preserve', 10, NULL),
  ('vinegar', 'preserve', 10, NULL),
  ('soup', 'preserve', 10, NULL),
  ('stock', 'preserve', 10, NULL),
  ('broth', 'preserve', 10, NULL),
  ('steak', 'preserve', 10, NULL),
  ('powder', 'preserve', 10, NULL);

-- Preserve pairs: both tokens must be present together
insert into canonical_builder_rules (token, action, paired_with, priority, notes) values
  ('red', 'preserve_pair', 'wine', 10, 'red wine â‰  wine'),
  ('white', 'preserve_pair', 'wine', 10, NULL),
  ('green', 'preserve_pair', 'onion', 10, 'green onion â‰  onion'),
  ('brown', 'preserve_pair', 'sugar', 10, NULL),
  ('powdered', 'preserve_pair', 'sugar', 10, NULL),
  ('jasmine', 'preserve_pair', 'rice', 10, NULL),
  ('basmati', 'preserve_pair', 'rice', 10, NULL),
  ('brown', 'preserve_pair', 'rice', 10, NULL),
  ('soy', 'preserve_pair', 'sauce', 10, NULL),
  ('hot', 'preserve_pair', 'sauce', 10, NULL),
  ('fish', 'preserve_pair', 'sauce', 10, NULL);
```

### The Builder Function

```ts
// lib/standardizer/deterministic-builder/build-canonical.ts

export interface CanonicalBuildResult {
  canonicalName: string
  confidence: number
  droppedTokens: string[]
  preservedTokens: string[]
  preservedPairs: [string, string][]
  needsReview: boolean
  matchedExistingCanonical: boolean
  matchedCanonicalId?: string
}

export async function buildCanonicalName(
  cleanedName: string,
  context: string,
  rules: CanonicalBuilderRule[]
): Promise<CanonicalBuildResult> {
  const tokens = tokenize(cleanedName)
  const droppedTokens: string[] = []
  const preservedTokens: string[] = []
  const preservedPairs: [string, string][] = []

  // Identify preserve_pairs first â€” they block dropping of constituent tokens
  const activePairs = rules
    .filter(r => r.action === 'preserve_pair')
    .filter(r => tokens.includes(r.token) && tokens.includes(r.pairedWith!))

  for (const pair of activePairs) {
    preservedPairs.push([pair.token, pair.pairedWith!])
    preservedTokens.push(pair.token, pair.pairedWith!)
  }

  // Apply drop rules, skipping preserved tokens
  const remainingTokens: string[] = []
  for (const token of tokens) {
    if (preservedTokens.includes(token)) {
      remainingTokens.push(token)
      continue
    }
    const dropRule = rules.find(r =>
      r.action === 'drop' && r.token === token
    )
    if (dropRule) {
      droppedTokens.push(token)
    } else {
      remainingTokens.push(token)
    }
  }

  // Apply preserve rules (explicit force-keep)
  for (const token of remainingTokens) {
    if (rules.some(r => r.action === 'preserve' && r.token === token)) {
      preservedTokens.push(token)
    }
  }

  // Build candidate canonical name
  let candidate = remainingTokens.join(' ').trim()

  // Apply existing form/variety retention â€” calls the same functions as processor.ts
  candidate = maybeRetainFormSpecificCanonical(candidate, cleanedName)
  candidate = maybeRetainVarietyCanonical(candidate, cleanedName)
  candidate = stripRetailSuffixTokensFromCanonicalName(candidate)

  // Try to find an existing canonical in the DB
  const existingMatch = await findExistingCanonical(candidate)

  if (existingMatch && existingMatch.similarity >= 0.92) {
    return {
      canonicalName: existingMatch.canonicalName,
      confidence: 0.85 + (existingMatch.similarity - 0.92) * 1.875,  // 0.85â€“0.95 range
      droppedTokens,
      preservedTokens: [...new Set(preservedTokens)],
      preservedPairs,
      needsReview: false,
      matchedExistingCanonical: true,
      matchedCanonicalId: existingMatch.id,
    }
  }

  // No confident existing match â€” either near-match or truly new
  const confidence = existingMatch
    ? 0.65 + existingMatch.similarity * 0.25  // 0.65â€“0.90 for low-similarity match
    : 0.50  // no match at all

  return {
    canonicalName: candidate,
    confidence,
    droppedTokens,
    preservedTokens: [...new Set(preservedTokens)],
    preservedPairs,
    needsReview: confidence < 0.85,
    matchedExistingCanonical: !!existingMatch,
    matchedCanonicalId: existingMatch?.id,
  }
}

// Uses pg_trgm + exact normalized match
async function findExistingCanonical(
  candidate: string
): Promise<{ id: string, canonicalName: string, similarity: number } | null> {
  const result = await supabase.rpc('fn_find_existing_canonical', {
    p_candidate: candidate,
    p_min_similarity: 0.60,
  })
  return result.data?.[0] ?? null
}
```

### Integration Into `processor.ts`

The deterministic builder runs **before** the LLM call, after the vector fast-path fails to auto-resolve:

```ts
// processor.ts â€” after vector fast-path, before LLM

const builtCanonical = await buildCanonicalName(cleanedName, context, rules)

if (builtCanonical.matchedExistingCanonical && builtCanonical.confidence >= 0.90) {
  obs.resolve('resolved_deterministic', builtCanonical.canonicalName, builtCanonical.matchedCanonicalId)
  await markResolved(row, ...)
  obs.emit()
  continue  // skip LLM entirely
}

if (builtCanonical.matchedExistingCanonical && builtCanonical.confidence >= 0.75) {
  // Inject the built canonical as the top hint â€” LLM still makes final call
  // but has a high-quality deterministic suggestion to validate
  hintNames.unshift(builtCanonical.canonicalName)
}

// Otherwise fall through to LLM as before
```

The `0.90` threshold is the initial value. It is tuned using the observability data from Phase 7's calibration.

### Admin Rule Management

```ts
// app/api/admin/canonical-builder-rules/route.ts
// Simple CRUD endpoint for the canonical_builder_rules table
// Allows adding/editing rules without code deploys
// Requires admin auth
```

### Files Changed
- New: `lib/standardizer/deterministic-builder/`
- New: `supabase/migrations/0017_canonical_builder_rules.sql`
- New: `app/api/admin/canonical-builder-rules/route.ts`
- New: `supabase/migrations/0017_fn_find_existing_canonical.sql`
- Modified: `queue/worker/processor.ts` â€” add builder call between vector fast-path and LLM

---

