#!/usr/bin/env python3
"""Populate canonical_substitution_proposals from consolidation candidate clusters.

For each canonical that appears in 2+ candidate pairs, this script:

  1. Builds a graph of all candidate pairs (from canonical_double_check_daily_stats).
  2. Finds connected components of size >= 3 (meaning at least one node has 2+
     neighbours).
  3. Computes the token intersection across all cluster members.
  4. Selects the cluster member whose name is most aligned with the common-token
     core as the substitution target (ties broken by product count, then name
     length, then lexicographic order).
  5. Writes one proposal row per (from, to) pair to canonical_substitution_proposals,
     upserting on conflict so repeated runs are idempotent.

Rows are written with status='pending' for manual human review.
"""

from __future__ import annotations

# ── Configuration ──────────────────────────────────────────────────────────────
MIN_SIMILARITY      = 0.92  # mirrors CONSOLIDATION_MIN_SIMILARITY
MIN_CLUSTER_DENSITY  = 0.10  # average clustering coefficient — filters hub-and-spoke stars
MIN_CLUSTER_SIZE     = 5    # minimum members in a cluster to generate proposals
MIN_MEMBER_COVERAGE  = 0.60 # common tokens must cover >= 60% of each member's tokens on average
LEXICAL_EDGE_MIN_OVERLAP = 0.60  # overlap coefficient for adding token-based edges
LEXICAL_TOKEN_MIN_LEN    = 4     # ignore very short shared tokens for lexical affinity
TOKEN_AFFINITY_WEIGHT    = 0.15  # blend token features alongside embeddings
MAX_LEXICAL_TOKEN_FAMILY = 4     # avoid giant components from generic tokens like "sauce"
# ───────────────────────────────────────────────────────────────────────────────

import argparse
import os
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from supabase import create_client

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT  = SCRIPT_DIR.parent.parent.parent
CHUNK_SIZE = 100


# ── Environment ────────────────────────────────────────────────────────────────

def load_environment() -> None:
    for p in [
        REPO_ROOT / ".env.local",
        REPO_ROOT / ".env",
        SCRIPT_DIR / ".env.local",
        SCRIPT_DIR / ".env",
    ]:
        load_dotenv(p, override=False)


DEFAULT_PAGE_SIZE = 1000


def parse_args() -> argparse.Namespace:
    load_environment()
    default_model = os.environ.get("EMBEDDING_OPENAI_MODEL", "").strip() or "nomic-embed-text"
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true",
                        help="Print proposals without writing to the database")
    parser.add_argument("--days", type=int, default=365,
                        help="How many days of history to scan (default: 365)")
    parser.add_argument("--model", default=default_model,
                        help="Embedding model name (default: nomic-embed-text)")
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE)
    return parser.parse_args()


def get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Missing Supabase credentials.")
    return create_client(url, key)


# ── Data fetching ──────────────────────────────────────────────────────────────

def fetch_candidates(supabase, days: int) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    resp = (
        supabase.table("canonical_double_check_daily_stats")
        .select(
            "source_canonical,target_canonical,direction,"
            "event_count,source_category,target_category,"
            "min_similarity,max_similarity"
        )
        .gte("event_date", cutoff)
        .gte("max_similarity", MIN_SIMILARITY)
        .in_("direction", ["lateral", "specific_to_generic"])
        .eq("decision", "skipped")
        .eq("reason", "vector_candidate_discovery")
        .limit(2000)
        .execute()
    )
    return resp.data or []


def fetch_ingredients_by_name(supabase, names: list[str]) -> dict[str, dict]:
    by_name: dict[str, dict] = {}
    for i in range(0, len(names), CHUNK_SIZE):
        chunk = names[i : i + CHUNK_SIZE]
        resp = (
            supabase.table("standardized_ingredients")
            .select("id, canonical_name, category")
            .in_("canonical_name", chunk)
            .execute()
        )
        for row in resp.data or []:
            by_name[row["canonical_name"]] = row
    return by_name


def fetch_embeddings_by_id(supabase, model: str, page_size: int) -> dict[str, np.ndarray]:
    """Returns standardized_ingredient_id -> embedding for this model."""
    rows: list[dict] = []
    offset = 0
    while True:
        resp = (
            supabase.table("ingredient_embeddings")
            .select("standardized_ingredient_id, embedding, input_text")
            .eq("model", model)
            .order("standardized_ingredient_id")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    result: dict[str, np.ndarray] = {}
    for row in rows:
        raw = row.get("embedding")
        if isinstance(raw, list):
            vec = raw
        elif isinstance(raw, str):
            raw = raw.strip()
            vec = [float(v) for v in raw[1:-1].split(",")] if raw.startswith("[") else None
        else:
            vec = None
        if vec:
            ingredient_id = row.get("standardized_ingredient_id")
            if ingredient_id:
                result[ingredient_id] = np.array(vec, dtype=np.float32)
    return result


def fetch_product_counts(supabase, ids: list[str]) -> dict[str, int]:
    from collections import Counter
    counts: Counter = Counter()
    for i in range(0, len(ids), CHUNK_SIZE):
        chunk = ids[i : i + CHUNK_SIZE]
        resp = (
            supabase.table("product_mappings")
            .select("standardized_ingredient_id")
            .in_("standardized_ingredient_id", chunk)
            .execute()
        )
        for row in resp.data or []:
            counts[row["standardized_ingredient_id"]] += 1
    return dict(counts)


# ── Tokenisation ───────────────────────────────────────────────────────────────

def tokenize(name: str) -> frozenset[str]:
    """Lowercase, normalise, split on whitespace; ignore single-char tokens."""
    normed = unicodedata.normalize("NFC", name).strip().lower()
    return frozenset(t for t in normed.split() if len(t) > 1)


def lexical_tokens(name: str) -> frozenset[str]:
    """Tokens eligible for lexical affinity and extra graph edges."""
    return frozenset(t for t in tokenize(name) if len(t) >= LEXICAL_TOKEN_MIN_LEN)


def lexical_overlap_score(name_a: str, name_b: str) -> float:
    """
    Overlap coefficient on informative tokens.

    This intentionally helps names like "turkey sausage" stay near other
    "* sausage" members even when the vector graph is thin or noisy.
    """
    tokens_a = lexical_tokens(name_a)
    tokens_b = lexical_tokens(name_b)
    if not tokens_a or not tokens_b:
        return 0.0
    shared = tokens_a & tokens_b
    if not shared:
        return 0.0
    return len(shared) / min(len(tokens_a), len(tokens_b))


def build_token_affinity_matrix(members: list[str]) -> np.ndarray | None:
    """Token-feature matrix used as a light lexical signal beside embeddings."""
    token_sets = [lexical_tokens(name) for name in members]
    token_counts: dict[str, int] = defaultdict(int)
    for tokens in token_sets:
        for token in tokens:
            token_counts[token] += 1

    vocab = sorted(token for token, count in token_counts.items() if count >= 2)
    if not vocab:
        return None

    token_to_idx = {token: idx for idx, token in enumerate(vocab)}
    matrix = np.zeros((len(members), len(vocab)), dtype=np.float32)
    for row_idx, tokens in enumerate(token_sets):
        for token in tokens:
            col_idx = token_to_idx.get(token)
            if col_idx is None:
                continue
            matrix[row_idx, col_idx] = 1.0 / token_counts[token]

    return matrix


def build_lexical_edge_set(names: list[str]) -> set[tuple[str, str]]:
    """Add edges only for specific token families, not very broad food types."""
    token_counts: dict[str, int] = defaultdict(int)
    for name in names:
        for token in lexical_tokens(name):
            token_counts[token] += 1

    result: set[tuple[str, str]] = set()
    for idx, src in enumerate(names):
        src_tokens = lexical_tokens(src)
        if not src_tokens:
            continue
        for tgt in names[idx + 1 :]:
            tgt_tokens = lexical_tokens(tgt)
            shared = {
                token for token in (src_tokens & tgt_tokens)
                if 2 <= token_counts[token] <= MAX_LEXICAL_TOKEN_FAMILY
            }
            if not shared:
                continue
            overlap = len(shared) / min(len(src_tokens), len(tgt_tokens))
            if overlap >= LEXICAL_EDGE_MIN_OVERLAP:
                result.add((min(src, tgt), max(src, tgt)))

    return result


# ── Graph / cluster logic ──────────────────────────────────────────────────────

def build_graph(candidates: list[dict]) -> dict[str, set[str]]:
    """Adjacency list keyed by canonical name, augmented with lexical edges."""
    adj: dict[str, set[str]] = defaultdict(set)
    for row in candidates:
        src = row["source_canonical"]
        tgt = row["target_canonical"]
        adj[src].add(tgt)
        adj[tgt].add(src)

    base_components = find_components(dict(adj))
    for component in base_components:
        for src, tgt in build_lexical_edge_set(sorted(component)):
            adj[src].add(tgt)
            adj[tgt].add(src)
    return dict(adj)


def components_of(nodes: frozenset[str], edge_set: set[tuple[str, str]]) -> list[frozenset[str]]:
    """Connected components of an arbitrary node subset using edge_set."""
    visited: set[str] = set()
    result: list[frozenset[str]] = []

    def dfs(node: str, component: set[str]) -> None:
        component.add(node)
        visited.add(node)
        for other in nodes:
            if other not in visited and (min(node, other), max(node, other)) in edge_set:
                dfs(other, component)

    for node in nodes:
        if node not in visited:
            component: set[str] = set()
            dfs(node, component)
            result.append(frozenset(component))

    return result


def find_components(adj: dict[str, set[str]]) -> list[frozenset[str]]:
    """Union-find to get connected components."""
    visited: set[str] = set()
    components: list[frozenset[str]] = []

    def dfs(node: str, component: set[str]) -> None:
        component.add(node)
        visited.add(node)
        for nb in adj.get(node, set()):
            if nb not in visited:
                dfs(nb, component)

    for node in adj:
        if node not in visited:
            component: set[str] = set()
            dfs(node, component)
            components.append(frozenset(component))

    return components


# ── Target selection ───────────────────────────────────────────────────────────

def select_target(
    members: frozenset[str],
    common_tokens: frozenset[str],
    product_counts_by_name: dict[str, int],
) -> str:
    """
    Pick the member whose name is most aligned with the common-token core.

    Scoring (higher = better):
      1. coverage  = |member_tokens ∩ common_tokens| / |common_tokens|
                     (how much of the core is represented)
      2. purity    = |member_tokens ∩ common_tokens| / |member_tokens|
                     (how much of the member name is core, no extra noise)
      3. product_count  (prefer the more-used canonical)
      4. -len(name)     (prefer shorter names as tiebreaker)
      5. lexicographic  (deterministic)
    """
    def score(name: str):
        tokens  = tokenize(name)
        overlap = tokens & common_tokens
        coverage = len(overlap) / max(len(common_tokens), 1)
        purity   = len(overlap) / max(len(tokens), 1)
        count    = product_counts_by_name.get(name, 0)
        return (coverage, purity, count, -len(name), name)

    return max(members, key=score)


# ── Proposal generation ────────────────────────────────────────────────────────

def cluster_density(component: frozenset[str], edge_set: set[tuple[str, str]]) -> float:
    """
    Average clustering coefficient across all nodes in the component.

    For each node, the local clustering coefficient is the fraction of its
    neighbours that are also connected to each other (triangle density within
    its neighbourhood).  A pure hub-and-spoke star scores 0.0 regardless of
    size; a complete graph scores 1.0.
    """
    members = list(component)

    def neighbours(node: str) -> set[str]:
        return {
            other for other in members
            if other != node and (min(node, other), max(node, other)) in edge_set
        }

    coeffs = []
    for node in members:
        nb = neighbours(node)
        k = len(nb)
        if k < 2:
            coeffs.append(0.0)
            continue
        triangle_edges = sum(
            1 for a in nb for b in nb
            if a < b and (min(a, b), max(a, b)) in edge_set
        )
        coeffs.append(triangle_edges / (k * (k - 1) / 2))

    return sum(coeffs) / len(coeffs) if coeffs else 0.0


def local_clustering_coefficient(
    node: str, component: frozenset[str], edge_set: set[tuple[str, str]]
) -> float:
    nb = {o for o in component if o != node and (min(node, o), max(node, o)) in edge_set}
    k = len(nb)
    if k < 2:
        return 0.0
    triangles = sum(
        1 for a in nb for b in nb
        if a < b and (min(a, b), max(a, b)) in edge_set
    )
    return triangles / (k * (k - 1) / 2)


_PCA_MIN_LEAF = 2  # minimum sub-cluster size emitted from PCA partitioning


def partition_by_pca(
    component: frozenset[str],
    edge_set: set[tuple[str, str]],
    name_to_embedding: dict[str, np.ndarray],
    force_split: bool = False,
) -> list[frozenset[str]]:
    """
    Recursively bisect a component along its first principal component until
    all sub-communities meet MIN_CLUSTER_DENSITY or reach _PCA_MIN_LEAF size.

    Splitting on PC1 (the axis of maximum variance in embedding space) finds
    the natural semantic boundary — more efficient than graph peeling because
    it uses the full embedding geometry, not just edge topology.

    Note: _PCA_MIN_LEAF is intentionally smaller than MIN_CLUSTER_SIZE because
    PCA sub-clusters don't need hub-node evidence; semantic proximity is enough.
    """
    if len(component) < _PCA_MIN_LEAF:
        return []

    # Once a PCA-derived group is small enough, emit it as-is and let the token
    # checks decide whether it is coherent enough to propose.
    if len(component) <= MIN_CLUSTER_SIZE:
        return [component]

    if not force_split and cluster_density(component, edge_set) >= MIN_CLUSTER_DENSITY:
        return [component]

    members = sorted(component)
    token_matrix = build_token_affinity_matrix(members)
    vecs, valid = [], []
    for idx, m in enumerate(members):
        emb = name_to_embedding.get(m)
        if emb is not None:
            parts = [emb.astype(np.float32)]
            if token_matrix is not None:
                parts.append((token_matrix[idx] * TOKEN_AFFINITY_WEIGHT).astype(np.float32))
            vecs.append(np.concatenate(parts))
            valid.append(m)

    if len(valid) < 2:
        return [component] if len(component) >= _PCA_MIN_LEAF else []

    X = np.stack(vecs).astype(np.float32)
    X -= X.mean(axis=0)

    # First principal component via truncated SVD — direction of max variance.
    _, _, Vt = np.linalg.svd(X, full_matrices=False)
    scores = X @ Vt[0]

    # Split by score rank rather than a raw median threshold. Using <= median can
    # collapse everything onto one side when several members tie exactly at the
    # median, which turns a valid PCA split into a no-op.
    order = sorted(zip(valid, scores), key=lambda item: (float(item[1]), item[0]))
    if len(order) < 2:
        return [component] if len(component) >= _PCA_MIN_LEAF else []

    score_values = np.array([score for _, score in order], dtype=np.float32)
    if np.allclose(score_values, score_values[0], atol=1e-6):
        return [component] if len(component) >= _PCA_MIN_LEAF else []

    midpoint = len(order) // 2
    group_a = frozenset(name for name, _ in order[:midpoint])
    group_b = frozenset(name for name, _ in order[midpoint:])

    # If the split is degenerate (all points on one side), stop here.
    if not group_a or not group_b:
        return [component] if len(component) >= _PCA_MIN_LEAF else []

    result: list[frozenset[str]] = []
    for group in (group_a, group_b):
        result.extend(partition_by_pca(group, edge_set, name_to_embedding, force_split=force_split))
    return result


def _try_emit(
    community: frozenset[str],
    label: str,
    similarity_map: dict[tuple[str, str], float],
    product_counts_by_name: dict[str, int],
    proposals: list[dict],
) -> None:
    """
    Apply token-intersection + coverage checks to a community and append
    proposals if it passes.  Used for both graph-dense clusters and
    PCA-derived sub-clusters (which have no density requirement).
    """
    token_sets = [tokenize(m) for m in community]
    common_tokens: frozenset[str] = frozenset.intersection(*token_sets)

    if not common_tokens:
        print(f"[Proposals] Skipping {label} (no common tokens): {', '.join(sorted(community))}")
        return

    avg_coverage = sum(
        len(ts & common_tokens) / max(len(ts), 1) for ts in token_sets
    ) / len(token_sets)
    if avg_coverage < MIN_MEMBER_COVERAGE:
        print(
            f"[Proposals] Skipping {label} (coverage={avg_coverage:.2f} < {MIN_MEMBER_COVERAGE}): "
            f"{', '.join(sorted(community))}"
        )
        return

    target = select_target(community, common_tokens, product_counts_by_name)
    max_sim = max(
        (similarity_map.get((min(a, b), max(a, b)), 0.0)
         for a in community for b in community if a != b),
        default=0.0,
    )

    for member in community:
        if member == target:
            continue
        proposals.append({
            "from_canonical":       member,
            "to_canonical":         target,
            "common_tokens":        sorted(common_tokens),
            "cluster_members":      sorted(community),
            "cluster_size":         len(community),
            "source_product_count": product_counts_by_name.get(member, 0),
            "target_product_count": product_counts_by_name.get(target, 0),
            "max_similarity":       round(max_sim, 6),
            "status":               "pending",
        })


def generate_proposals(
    components: list[frozenset[str]],
    candidates: list[dict],
    product_counts_by_name: dict[str, int],
    name_to_embedding: dict[str, np.ndarray],
) -> tuple[list[dict], set[tuple[str, str]]]:
    """
    For each component with MIN_CLUSTER_SIZE+ members:
      - If graph-dense: emit proposals directly.
      - If sparse: bisect with PCA, then emit proposals from each sub-cluster
        using token + coverage checks only (PCA already ensures semantic
        coherence; graph density is irrelevant within a PCA partition).
    """
    similarity_map: dict[tuple[str, str], float] = {}
    edge_set: set[tuple[str, str]] = set()
    for row in candidates:
        src = row["source_canonical"]
        tgt = row["target_canonical"]
        sim = row.get("max_similarity") or 0.0
        key = (min(src, tgt), max(src, tgt))
        similarity_map[key] = max(similarity_map.get(key, 0.0), sim)
        edge_set.add(key)

    candidate_components = find_components(build_graph(candidates))
    for component in candidate_components:
        edge_set.update(build_lexical_edge_set(sorted(component)))

    proposals: list[dict] = []

    for component in components:
        if len(component) < MIN_CLUSTER_SIZE:
            continue

        density = cluster_density(component, edge_set)
        sub_communities: list[frozenset[str]] | None = None
        if density >= MIN_CLUSTER_DENSITY:
            before = len(proposals)
            _try_emit(component, "cluster", similarity_map, product_counts_by_name, proposals)
            if len(proposals) > before:
                continue
            sub_communities = partition_by_pca(
                component, edge_set, name_to_embedding, force_split=True
            )

        # Sparse component — bisect along PCA axes to find semantic sub-clusters.
        if sub_communities is None:
            sub_communities = partition_by_pca(component, edge_set, name_to_embedding)
        if not sub_communities:
            print(
                f"[Proposals] Skipping cluster (density={density:.2f}, no PCA partitions): "
                f"{', '.join(sorted(component))}"
            )
            continue

        print(
            f"[Proposals] PCA-partitioned (density={density:.2f}) -> "
            f"{len(sub_communities)} sub-cluster(s): {', '.join(sorted(component))}"
        )
        for sub in sub_communities:
            _try_emit(sub, f"sub-cluster({len(sub)})", similarity_map, product_counts_by_name, proposals)

    return proposals, edge_set


# ── Database write ─────────────────────────────────────────────────────────────

def upsert_proposals(supabase, proposals: list[dict]) -> int:
    """Upsert proposals; returns the number written."""
    written = 0
    for i in range(0, len(proposals), 50):
        batch = proposals[i : i + 50]
        (
            supabase.table("canonical_substitution_proposals")
            .upsert(batch, on_conflict="from_canonical,to_canonical")
            .execute()
        )
        written += len(batch)
    return written


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    args     = parse_args()
    supabase = get_supabase()

    print(f"[Proposals] Fetching candidates (last {args.days} days, similarity >= {MIN_SIMILARITY})...")
    candidates = fetch_candidates(supabase, args.days)
    if not candidates:
        raise SystemExit("No candidates found.")
    print(f"[Proposals] {len(candidates)} candidate rows")

    # Collect all canonical names
    all_names = list({
        name
        for row in candidates
        for name in (row["source_canonical"], row["target_canonical"])
    })

    print(f"[Proposals] Fetching ingredient metadata for {len(all_names)} canonicals...")
    ingredients_by_name = fetch_ingredients_by_name(supabase, all_names)
    ingredient_ids = [ing["id"] for ing in ingredients_by_name.values()]

    product_counts_by_id = fetch_product_counts(supabase, ingredient_ids)
    product_counts_by_name = {
        name: product_counts_by_id.get(ing["id"], 0)
        for name, ing in ingredients_by_name.items()
    }

    print(f"[Proposals] Fetching embeddings for model \"{args.model}\"...")
    embeddings_by_id = fetch_embeddings_by_id(supabase, args.model, args.page_size)
    name_to_embedding = {
        name: embeddings_by_id[ing["id"]]
        for name, ing in ingredients_by_name.items()
        if ing["id"] in embeddings_by_id
    }
    print(
        f"[Proposals] {len(embeddings_by_id):,} embeddings loaded; "
        f"{len(name_to_embedding)} matched to candidate canonicals"
    )

    print("[Proposals] Building candidate graph...")
    adj        = build_graph(candidates)
    components = find_components(adj)

    multi_member = [c for c in components if len(c) >= MIN_CLUSTER_SIZE]
    print(
        f"[Proposals] {len(components)} connected component(s) total; "
        f"{len(multi_member)} with {MIN_CLUSTER_SIZE}+ members"
    )

    proposals, edge_set = generate_proposals(components, candidates, product_counts_by_name, name_to_embedding)
    print(f"[Proposals] {len(proposals)} substitution proposal(s) generated")

    if not proposals:
        print("[Proposals] Nothing to write.")
        return

    for p in proposals:
        density = cluster_density(
            frozenset(p["cluster_members"]), edge_set
        )
        print(
            f"  {p['from_canonical']:40s} -> {p['to_canonical']:40s} "
            f"tokens={p['common_tokens']}  cluster={p['cluster_size']}  "
            f"density={density:.2f}  sim={p['max_similarity']:.4f}"
        )

    if args.dry_run:
        print("[Proposals] --dry-run; nothing written.")
        return

    written = upsert_proposals(supabase, proposals)
    print(f"[Proposals] Wrote {written} proposal(s) to canonical_substitution_proposals.")


if __name__ == "__main__":
    main()
