# IDF Cache Wire-up and PPMI Bigram Cache Plan

## Agent Metadata

- `Doc Kind`: `migration-plan`
- `Canonicality`: `advisory`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-03-06`
- `Primary Surfaces`: `supabase/migrations/`, `lib/database/`, `public.fn_word_weighted_similarity`, `public.canonical_token_idf_cache`
- `Update Trigger`: IDF cache source, bigram schema, or `fn_word_weighted_similarity` integration changes.

## Agent Use

- `Read this when`: implementing or modifying the IDF cache wire-up, the PPMI bigram table, or their consumers.
- `Stop reading when`: changes are outside matching/scoring infrastructure.
- `Escalate to`: `docs/database-guide.md`, `docs/agent-canonical-context.md`.

## Purpose

Ship the IDF cache as the immediate win (eliminates the inline `standardized_ingredients` scan on every `fn_word_weighted_similarity` call), then stub the PPMI bigram table so the schema is ready when collocation misscoring is confirmed in practice.

---

## Background

`fn_word_weighted_similarity` currently computes token IDF inline via a CTE that scans all of `standardized_ingredients` on every invocation. `canonical_token_idf_cache` already exists and has a working lazy-refresh accessor (`fn_get_canonical_token_idf`), but `fn_word_weighted_similarity` never reads from it.

Additionally, `fn_refresh_canonical_token_idf_cache` reads from `canonical_creation_probation_events` instead of `standardized_ingredients` — so the cache, if populated, would contain wrong frequencies.

---

## Phase 1 — Wire `fn_word_weighted_similarity` to the IDF Cache

**Migration:** `0012_wire_idf_cache.sql`

### 1a. Fix the refresh source

`fn_refresh_canonical_token_idf_cache` currently derives token frequencies from `canonical_creation_probation_events` alone. The correct source is a `UNION DISTINCT` of both tables:

```sql
SELECT DISTINCT canonical_name FROM standardized_ingredients
UNION
SELECT DISTINCT canonical_name FROM canonical_creation_probation_events
```

**Why both:** `standardized_ingredients` is the authoritative promoted vocabulary — the names `fn_match_ingredient` actually scores against. `canonical_creation_probation_events` contains proposed candidates not yet promoted (~531 names are exclusive to probation at current counts). Their tokens are real food vocabulary appearing in the live product stream. Excluding them causes those tokens to score as OOV in `fn_word_weighted_similarity`, giving them artificially high IDF and distorting tiebreak scoring in passes 2 and 4 of `fn_match_ingredient`.

**Caveat:** probation names are pre-review. If the queue has written noisy or malformed names to that table, they will pollute token frequencies. Verify probation name quality before committing the union as the canonical source.

Document count should be `COUNT(*)` over the union result, treating each distinct canonical name as one document.

### 1b. Rewrite `fn_word_weighted_similarity` to use the cache

Replace the inline `word_df` CTE with a join to `canonical_token_idf_cache` via `fn_get_canonical_token_idf()`. The lazy-refresh accessor already handles stale-cache auto-refresh (TTL: 1 hour), so the function body needs no TTL logic of its own.

The `p_cap_oov` floor (`GREATEST(df, 1)`) stays identical — it just reads `doc_freq` from the cache row instead of computing it inline.

### 1c. Verification steps

- Call `fn_refresh_canonical_token_idf_cache()` manually; confirm rows appear in `canonical_token_idf_cache`.
- Call `SELECT fn_word_weighted_similarity('olive oil', 'olive oil')` before and after migration; scores must be identical.
- Confirm timing improvement on a sample of `fn_match_ingredient` calls (passes 2 and 4 call `fn_word_weighted_similarity`).

---

## Phase 2 — Add `canonical_bigram_pmi_cache` Schema

**Migration:** `0013_bigram_pmi_schema.sql`

Schema only — no refresh function, no consumer wiring. Additive, no gate to next phase.

```sql
CREATE TABLE public.canonical_bigram_pmi_cache (
    token_a         text        NOT NULL,
    token_b         text        NOT NULL,  -- positional order from canonical name
    doc_freq_a      integer     NOT NULL,  -- denormalized from IDF cache at refresh time
    doc_freq_b      integer     NOT NULL,
    joint_freq      integer     NOT NULL,  -- canonicals containing A immediately followed by B
    document_count  integer     NOT NULL,  -- corpus size snapshot at refresh time
    ppmi_score      numeric     NOT NULL,  -- GREATEST(0, ln(P(A,B) / (P(A)*P(B))))
    is_collocation  boolean     NOT NULL DEFAULT false,
    refreshed_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (token_a, token_b)
);
```

**Design notes:**

- `(token_a, token_b)` represents the bigram in positional order. "hot sauce" and "sauce hot" are distinct rows. The lookup in `fn_word_weighted_similarity` is a point lookup on both columns — no range scan.
- `doc_freq_a` and `doc_freq_b` are denormalized from the IDF cache at refresh time. The query-time path in `fn_word_weighted_similarity` needs no join back to the IDF cache.
- `ppmi_score` stores Positive PMI — `GREATEST(0, raw_pmi)`. Raw PMI is unbounded negative for non-co-occurring pairs; PPMI collapses those to zero, which is the correct value for "not a collocation."
- `is_collocation` is the only field `fn_word_weighted_similarity` reads at query time. Everything else exists to support the refresh function and diagnostic queries.
- No RLS needed — service-role-only access, same as `canonical_token_idf_cache`.

---

## Phase 3 — `fn_refresh_canonical_bigram_pmi_cache()` (deferred)

**Gate:** Confirm that collocations are actually causing misscoring in `fn_match_ingredient` output before building this. Do not build speculatively.

When built:

1. Assert `canonical_token_idf_cache` was refreshed within the last hour (or call `fn_refresh_canonical_token_idf_cache()` directly).
2. Generate adjacent token pairs by splitting each `canonical_name` on spaces and zipping `[i, i+1]` — positional order preserved.
3. Apply min-count gate before computing PPMI: only emit bigrams where `doc_freq_a >= 5` AND `doc_freq_b >= 5` AND `joint_freq >= 3`. Constants should be named, tunable.
4. Compute: `ppmi_score = GREATEST(0, ln( (joint_freq::numeric / document_count) / ((doc_freq_a::numeric / document_count) * (doc_freq_b::numeric / document_count)) ))`.
5. Set `is_collocation = ppmi_score >= 2.0 AND joint_freq >= 3`. Threshold is tunable.
6. Full DELETE + re-INSERT. Corpus is small; incremental complexity is not justified.

**Refresh cadence:** Daily, called after the IDF cache refresh in whatever scheduler owns it.

---

## Phase 4 — Use `is_collocation` in `fn_word_weighted_similarity` (deferred)

**Gate:** Phase 3 complete and collocation suppression confirmed to improve match quality.

When built, after tokenizing `p_query`, scan adjacent pairs against `canonical_bigram_pmi_cache WHERE is_collocation = true`. For matched pairs, replace the two individual token scores with a single compound score — use the higher of the two IDF weights, score the compound against the candidate as a unit via `strict_word_similarity`. This prevents tokens like "extra", "virgin", "sea", "brown" from contributing double novelty when they appear as part of a known collocation.

---

## Sequencing Summary

| Step | Migration | Deliverable | Gate to next |
|---|---|---|---|
| 1 | `0012_wire_idf_cache` | IDF cache wired; inline scan eliminated | Score parity confirmed; timing measured |
| 2 | `0013_bigram_pmi_schema` | Bigram table schema exists | None — additive only |
| 3 | — | `fn_refresh_canonical_bigram_pmi_cache` | Collocations confirmed to cause misscores |
| 4 | `0014_wire_collocation_scoring` | `fn_word_weighted_similarity` reads `is_collocation` | Phase 3 validated |