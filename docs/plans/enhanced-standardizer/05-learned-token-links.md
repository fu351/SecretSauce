## Phase 5 â€” Learned Token Links
**Executor: Claude. Database access required.**

**Risk: Low. Read path only for hot path. Writes are async.**

### Goal
Build synonym expansion so that "garbanzo beans" expands to include "chickpea" tokens before retrieval â€” improving recall for common synonyms and transliterations that exact string matching misses.

### Schema

```sql
-- supabase/migrations/0016_token_links.sql

create table learned_token_links (
  token_a text not null,
  token_b text not null,

  confidence numeric(5,4) not null default 0.50,
  co_occurrence_count integer not null default 0,

  -- Same cold-start rules as alias edges
  accept_count integer not null default 0,
  reject_count integer not null default 0,

  source text not null check (source in (
    'llm_resolution',     -- both tokens appeared in a confirmed resolution
    'recipe_upload_human_label', -- human-reviewed recipe label
    'recipe_edit_human_label', -- explicit correction in recipe edit flow
    'consolidation_merge', -- loser and survivor shared a token
    'manual_seed'         -- hand-curated seeds
  )),

  last_seen_at timestamptz not null default now(),
  primary key (token_a, token_b),
  check (token_a < token_b)  -- canonical ordering prevents (a,b) and (b,a) duplicates
);

create index idx_ltl_token_a on learned_token_links (token_a)
  where confidence >= 0.70;
create index idx_ltl_token_b on learned_token_links (token_b)
  where confidence >= 0.70;
```

### Token Link Learning

Token links are written **only** when a resolution has high confidence and the resolved canonical contains tokens not present in the raw alias:

```ts
// lib/standardizer/token-links/extract-links.ts

export function extractTokenLinks(
  alias: string,
  canonicalName: string,
  confidence: number
): TokenLinkCandidate[] {
  if (confidence < 0.85) return []  // only learn from confident resolutions

  const aliasTokens = new Set(tokenize(alias))
  const canonicalTokens = new Set(tokenize(canonicalName))

  // Tokens in canonical that don't appear in alias â€” these are synonym links
  const novelCanonicalTokens = [...canonicalTokens].filter(t => !aliasTokens.has(t))
  const novelAliasTokens = [...aliasTokens].filter(t => !canonicalTokens.has(t))

  const links: TokenLinkCandidate[] = []
  for (const at of novelAliasTokens) {
    for (const ct of novelCanonicalTokens) {
      if (at.length >= 4 && ct.length >= 4) {  // skip short tokens
        links.push({
          tokenA: [at, ct].sort()[0],
          tokenB: [at, ct].sort()[1],
          source: 'llm_resolution',
        })
      }
    }
  }
  return links
}

// Example: alias="garbanzo beans" â†’ canonical="chickpeas", confidence=0.92
// aliasTokens: {garbanzo, beans}
// canonicalTokens: {chickpeas}
// novelAliasTokens: {garbanzo, beans}
// novelCanonicalTokens: {chickpeas}
// links: [{garbanzo, chickpeas}, {beans, chickpeas}]
```

### Token Expansion at Query Time

Token expansion happens only as a pre-processing step for the fuzzy-IDF and MinHash generators. It **never** produces a direct resolution â€” it improves recall only.

```ts
// lib/standardizer/token-links/expand-query.ts

export async function expandQueryTokens(
  cleanedName: string,
  maxExpansions: number = 3
): Promise<string[]> {
  const tokens = tokenize(cleanedName)

  // Look up high-confidence links for each token
  const expansions = await supabase
    .from('learned_token_links')
    .select('token_a, token_b')
    .or(tokens.map(t => `token_a.eq.${t},token_b.eq.${t}`).join(','))
    .gte('confidence', 0.75)
    .gte('accept_count', 5)
    .limit(maxExpansions * tokens.length)

  const expanded = new Set(tokens)
  for (const link of (expansions.data ?? [])) {
    const partner = tokens.includes(link.token_a) ? link.token_b : link.token_a
    expanded.add(partner)
  }

  return Array.from(expanded)
}
```

The fuzzy-IDF and MinHash generators optionally accept an expanded token list. The expansion adds maybe 20ms of latency in exchange for recovering synonym recall.

### Manual Seeds

A small seed migration covers the most common known synonyms so the system doesn't have to learn them from scratch:

```sql
-- supabase/migrations/0016_token_links.sql (continued)

insert into learned_token_links (token_a, token_b, confidence, accept_count, source)
values
  ('chickpea', 'garbanzo', 0.95, 20, 'manual_seed'),
  ('zucchini', 'courgette', 0.95, 20, 'manual_seed'),
  ('eggplant', 'aubergine', 0.95, 20, 'manual_seed'),
  ('cilantro', 'coriander', 0.95, 20, 'manual_seed'),
  ('scallion', 'onion', 0.80, 20, 'manual_seed'),   -- lower: not always interchangeable
  ('arugula', 'rocket', 0.95, 20, 'manual_seed'),
  ('bell', 'capsicum', 0.90, 20, 'manual_seed')
on conflict (token_a, token_b) do nothing;
```

---

