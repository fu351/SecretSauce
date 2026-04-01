#!/usr/bin/env python3
"""Scatter plot of consolidation candidates in PCA embedding space.

All ingredients are shown as background context. Consolidation candidate pairs
are overlaid with a line connecting each pair, coloured by the worker's
rejection reason. An interactive similarity threshold slider lets you see
which pairs would be allowed at different thresholds without re-running.
"""

from __future__ import annotations

# ── Configuration ──────────────────────────────────────────────────────────────
N_COMPONENTS                = 10    # PCA axes to pre-compute
WEIGHTED_SIMILARITY_THRESHOLD = 0.97  # mirrors CONSOLIDATION_WEIGHTED_SIMILARITY_THRESHOLD
MIN_WEIGHTED_PRODUCT_COUNT  = 5     # mirrors CONSOLIDATION_MIN_WEIGHTED_PRODUCT_COUNT
MIN_SIMILARITY              = 0.92  # mirrors CONSOLIDATION_MIN_SIMILARITY
MIN_EVENT_COUNT             = 2     # mirrors CONSOLIDATION_MIN_EVENT_COUNT
# ───────────────────────────────────────────────────────────────────────────────

import argparse
import json
import os
import unicodedata
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from sklearn.decomposition import PCA
from supabase import create_client

SCRIPT_DIR   = Path(__file__).resolve().parent
REPO_ROOT    = SCRIPT_DIR.parent.parent.parent
DEFAULT_OUTPUT = REPO_ROOT / "backend" / "scripts" / "output" / "consolidation-candidate-scatter.html"
DEFAULT_PAGE_SIZE = 1000
CHUNK_SIZE   = 100


# ── Environment & CLI ──────────────────────────────────────────────────────────

def load_environment() -> None:
    for p in [
        REPO_ROOT / ".env.local",
        REPO_ROOT / ".env",
        SCRIPT_DIR / ".env.local",
        SCRIPT_DIR / ".env",
    ]:
        load_dotenv(p, override=False)


def parse_args() -> argparse.Namespace:
    load_environment()
    default_model = os.environ.get("EMBEDDING_OPENAI_MODEL", "").strip() or "nomic-embed-text"
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model",     default=default_model)
    parser.add_argument("--output",    default=str(DEFAULT_OUTPUT))
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE)
    return parser.parse_args()


def get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Missing Supabase credentials.")
    return create_client(url, key)


# ── Data fetching ──────────────────────────────────────────────────────────────

def fetch_candidates(supabase) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%d")

    resp = (
        supabase.table("canonical_double_check_daily_stats")
        .select(
            "event_date,source_canonical,target_canonical,decision,reason,"
            "direction,event_count,source_category,target_category,"
            "min_similarity,max_similarity,min_confidence,max_confidence"
        )
        .gte("event_date", cutoff)
        .gte("max_similarity", MIN_SIMILARITY)
        .in_("direction", ["lateral", "specific_to_generic"])
        .eq("decision", "skipped")
        .eq("reason", "vector_candidate_discovery")
        .limit(1000)
        .execute()
    )
    return resp.data or []


def fetch_embeddings(supabase, model: str, page_size: int) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        end = offset + page_size - 1
        resp = (
            supabase.table("ingredient_embeddings")
            .select("id, standardized_ingredient_id, embedding, input_text, model")
            .eq("model", model)
            .order("standardized_ingredient_id")
            .range(offset, end)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def fetch_ingredients(supabase, ids: list[str]) -> dict[str, dict]:
    by_id: dict[str, dict] = {}
    for i in range(0, len(ids), CHUNK_SIZE):
        chunk = ids[i : i + CHUNK_SIZE]
        resp = (
            supabase.table("standardized_ingredients")
            .select("id, canonical_name, category")
            .in_("id", chunk)
            .execute()
        )
        for row in resp.data or []:
            by_id[row["id"]] = row
    return by_id


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


def fetch_product_counts(supabase, ids: list[str]) -> dict[str, int]:
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


def parse_embedding(value) -> list[float] | None:
    if isinstance(value, list):
        return [float(v) for v in value]
    if isinstance(value, str):
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            return [float(v) for v in value[1:-1].split(",")]
    return None


# ── Guard logic (mirrors the TypeScript worker) ────────────────────────────────

def _normalize(name: str) -> str:
    return unicodedata.normalize("NFC", name).strip().lower()


def _strip_plural_s(name: str) -> str:
    return " ".join(
        t[:-1] if t.endswith("s") and not t.endswith("ss") else t
        for t in name.split()
        if t
    )


def _singularize(name: str) -> str:
    tokens = [t for t in name.split() if t]
    result = []
    for t in tokens:
        if t.endswith("ies") and len(t) > 3:
            result.append(t[:-3] + "y")
        elif t.endswith("oes") and len(t) > 3:
            result.append(t[:-2])
        elif t.endswith("ses") or t.endswith("xes") or t.endswith("zes"):
            result.append(t[:-2])
        elif t.endswith("s") and not t.endswith("ss") and len(t) > 2:
            result.append(t[:-1])
        else:
            result.append(t)
    return " ".join(result)


def assess_candidate(
    row: dict,
    product_counts_by_name: dict[str, int],
    weighted_threshold: float,
    min_weighted_count: float,
) -> str:
    """Returns the assessment reason string. Prefix 'allowed:' means permitted."""
    src_cat = (row.get("source_category") or "").strip() or None
    tgt_cat = (row.get("target_category") or "").strip() or None

    if src_cat and tgt_cat and src_cat != tgt_cat:
        return "cross_category_requires_manual_review"

    direction = row.get("direction", "")
    if direction != "lateral":
        return f"direction_{direction}_requires_manual_review"

    src = _normalize(row["source_canonical"])
    tgt = _normalize(row["target_canonical"])

    if not src or not tgt:
        return "empty_canonical_name"

    if src == tgt:
        return "allowed:exact_normalized_match"

    if _strip_plural_s(src) == _strip_plural_s(tgt):
        return "allowed:simple_plural_s_match"

    if _singularize(src) == _singularize(tgt):
        return "allowed:singularized_match"

    src_count = product_counts_by_name.get(row["source_canonical"], 0)
    tgt_count = product_counts_by_name.get(row["target_canonical"], 0)
    geo_mean  = (src_count * tgt_count) ** 0.5
    similarity = row.get("max_similarity") or 0

    if similarity >= weighted_threshold and geo_mean >= min_weighted_count:
        return "allowed:weighted_product_count_vector_match"

    return "non_trivial_lateral_variant_requires_manual_review"


# ── HTML output ────────────────────────────────────────────────────────────────

def sanitize_html(v: str) -> str:
    return str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def build_html(
    background_points: list[dict],
    pairs: list[dict],
    model: str,
    weighted_threshold: float,
    min_weighted_count: float,
) -> str:
    payload = json.dumps({
        "backgroundPoints": background_points,
        "pairs": pairs,
        "model": model,
        "weightedThreshold": weighted_threshold,
        "minWeightedCount": min_weighted_count,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }).replace("<", "\\u003c")

    model_str   = sanitize_html(model)
    generated   = sanitize_html(datetime.now().strftime("%c"))
    pair_count  = len(pairs)
    bg_count    = len(background_points)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Consolidation Candidate Scatter</title>
  <style>
    :root {{
      --bg: #f6f0e8; --panel: rgba(255,251,246,0.92); --ink: #1f2a1f;
      --muted: #5f6b5f; --border: rgba(31,42,31,0.14);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0; font-family: Georgia, serif; color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(203,109,81,0.16), transparent 28%),
        radial-gradient(circle at top right, rgba(111,143,114,0.18), transparent 32%),
        linear-gradient(180deg, #f8f2eb 0%, #efe7dd 100%);
      min-height: 100vh;
    }}
    .layout {{
      display: grid; grid-template-columns: 340px minmax(0,1fr);
      gap: 20px; padding: 20px;
    }}
    .panel {{
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 18px; backdrop-filter: blur(10px);
      box-shadow: 0 18px 50px rgba(74,53,39,0.08);
    }}
    .sidebar {{ padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; max-height: 100vh; }}
    h1 {{ margin: 0; font-size: 1.6rem; line-height: 1.05; letter-spacing: -0.03em; }}
    p, label, select, input {{ font-size: 0.95rem; }}
    .muted {{ color: var(--muted); }}
    .statline {{
      display: grid; gap: 6px; padding: 12px;
      border: 1px solid var(--border); border-radius: 14px;
      background: rgba(255,255,255,0.55); font-size: 0.9rem;
    }}
    .controls {{ display: grid; gap: 12px; }}
    .controls label {{ display: grid; gap: 5px; font-size: 0.9rem; }}
    .row-label {{ display: flex; justify-content: space-between; }}
    input[type=range], select {{
      width: 100%; border-radius: 10px; border: 1px solid var(--border);
      padding: 8px 10px; background: rgba(255,255,255,0.92); color: var(--ink);
    }}
    input[type=range] {{ padding: 0; }}
    .reason-filters {{ display: grid; gap: 6px; }}
    .reason-row {{
      display: flex; align-items: center; gap: 8px;
      font-size: 0.85rem; cursor: pointer;
    }}
    .reason-swatch {{
      width: 12px; height: 12px; border-radius: 3px; flex: 0 0 auto;
    }}
    .canvas-wrap {{ padding: 16px; position: relative; min-height: 82vh; }}
    canvas {{
      width: 100%; height: 82vh; display: block; border-radius: 16px;
      background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,241,234,0.92));
      border: 1px solid var(--border);
    }}
    .tooltip {{
      position: absolute; pointer-events: none; max-width: 300px;
      padding: 10px 14px; border-radius: 12px;
      background: rgba(31,42,31,0.93); color: white; font-size: 0.88rem;
      transform: translate(12px, 12px); opacity: 0;
      transition: opacity 100ms ease; line-height: 1.5;
    }}
    @media (max-width: 980px) {{
      .layout {{ grid-template-columns: 1fr; }}
      .canvas-wrap, canvas {{ min-height: 64vh; height: 64vh; }}
    }}
  </style>
</head>
<body>
<div class="layout">
  <aside class="panel sidebar">
    <div>
      <h1>Candidate Pair Scatter</h1>
      <p class="muted">Consolidation candidates in PCA space. Lines connect each pair; colour = worker decision.</p>
    </div>
    <div class="statline">
      <strong>{pair_count} candidate pairs &nbsp;·&nbsp; {bg_count:,} background ingredients</strong>
      <span class="muted">Model: {model_str}</span>
      <span class="muted">Generated: {generated}</span>
    </div>
    <div class="controls">
      <label>
        <span>Search canonical name</span>
        <input id="searchInput" type="search" placeholder="apple, yogurt..." />
      </label>
      <label>
        <span class="row-label">
          Similarity threshold
          <span id="simThreshVal">{weighted_threshold:.2f}</span>
        </span>
        <input id="simThreshInput" type="range" min="0.90" max="1.00" step="0.01"
               value="{weighted_threshold}" />
      </label>
      <label>
        <span class="row-label">
          Min weighted product count
          <span id="minCountVal">{min_weighted_count:.0f}</span>
        </span>
        <input id="minCountInput" type="range" min="0" max="50" step="1"
               value="{min_weighted_count}" />
      </label>
      <label>
        <span class="row-label">Pair line width <span id="lineWidthVal">2</span></span>
        <input id="lineWidthInput" type="range" min="1" max="6" step="1" value="2" />
      </label>
      <div>
        <p class="muted" style="margin:0 0 6px">Filter by reason</p>
        <div class="reason-filters" id="reasonFilters"></div>
      </div>
      <label style="flex-direction:row;align-items:center;gap:8px;display:flex;">
        <input id="showBgToggle" type="checkbox" checked style="width:auto;" />
        Show background ingredients
      </label>
      <label style="flex-direction:row;align-items:center;gap:8px;display:flex;">
        <input id="scaleByCountToggle" type="checkbox" style="width:auto;" />
        Scale pair dots by product count
      </label>
    </div>
  </aside>
  <main class="panel canvas-wrap">
    <canvas id="plot"></canvas>
    <div id="tooltip" class="tooltip"></div>
  </main>
</div>
<script id="payload" type="application/json">{payload}</script>
<script>
  const payload  = JSON.parse(document.getElementById("payload").textContent);
  const canvas   = document.getElementById("plot");
  const tooltip  = document.getElementById("tooltip");
  const ctx      = canvas.getContext("2d");

  const searchInput      = document.getElementById("searchInput");
  const simThreshInput   = document.getElementById("simThreshInput");
  const simThreshVal     = document.getElementById("simThreshVal");
  const minCountInput    = document.getElementById("minCountInput");
  const minCountVal      = document.getElementById("minCountVal");
  const lineWidthInput   = document.getElementById("lineWidthInput");
  const lineWidthVal     = document.getElementById("lineWidthVal");
  const showBgToggle     = document.getElementById("showBgToggle");
  const scaleByCountToggle = document.getElementById("scaleByCountToggle");
  const reasonFiltersEl  = document.getElementById("reasonFilters");

  // ── Reason palette ──────────────────────────────────────────────────────────
  const REASON_META = {{
    "allowed:exact_normalized_match":           {{ label: "Allowed · exact match",           color: "#4caf74" }},
    "allowed:simple_plural_s_match":            {{ label: "Allowed · plural-s",              color: "#6fbf8a" }},
    "allowed:singularized_match":               {{ label: "Allowed · singularized",           color: "#8ed4a0" }},
    "allowed:weighted_product_count_vector_match": {{ label: "Allowed · weighted heuristic", color: "#a8e6bc" }},
    "non_trivial_lateral_variant_requires_manual_review": {{ label: "Manual · non-trivial lateral", color: "#cb6d51" }},
    "cross_category_requires_manual_review":    {{ label: "Manual · cross-category",          color: "#d4a24c" }},
    "direction_specific_to_generic_requires_manual_review": {{ label: "Manual · specific→generic", color: "#8b6fb3" }},
    "direction_generic_to_specific_requires_manual_review": {{ label: "Manual · generic→specific", color: "#b36f9e" }},
    "empty_canonical_name":                     {{ label: "Error · empty name",               color: "#999" }},
  }};
  const DEFAULT_COLOR = "#888";

  function reasonColor(r) {{ return (REASON_META[r] || {{}}).color || DEFAULT_COLOR; }}
  function reasonLabel(r) {{ return (REASON_META[r] || {{}}).label || r; }}

  // ── Build reason filter checkboxes ──────────────────────────────────────────
  const allReasons = [...new Set(payload.pairs.map(p => p.staticReason))].sort();
  const enabledReasons = new Set(allReasons);

  allReasons.forEach(r => {{
    const row = document.createElement("label");
    row.className = "reason-row";
    row.innerHTML = `
      <input type="checkbox" checked data-reason="${{r}}" style="width:auto;" />
      <span class="reason-swatch" style="background:${{reasonColor(r)}}"></span>
      <span>${{reasonLabel(r)}}</span>
    `;
    row.querySelector("input").addEventListener("change", e => {{
      if (e.target.checked) enabledReasons.add(r); else enabledReasons.delete(r);
      draw();
    }});
    reasonFiltersEl.appendChild(row);
  }});

  // ── Coordinate helpers ──────────────────────────────────────────────────────
  // Collect all points to compute a shared extent for stable axes
  const allX = [...payload.backgroundPoints.map(p => p.coords[0]),
                 ...payload.pairs.flatMap(p => [p.source.coords[0], p.target.coords[0]])];
  const allY = [...payload.backgroundPoints.map(p => p.coords[1]),
                 ...payload.pairs.flatMap(p => [p.source.coords[1], p.target.coords[1]])];
  const globalMinX = Math.min(...allX), globalMaxX = Math.max(...allX);
  const globalMinY = Math.min(...allY), globalMaxY = Math.max(...allY);
  const globalRangeX = Math.max(globalMaxX - globalMinX, 1e-9);
  const globalRangeY = Math.max(globalMaxY - globalMinY, 1e-9);

  const maxPairProductCount = Math.max(1,
    ...payload.pairs.flatMap(p => [p.source.productCount, p.target.productCount])
  );

  function toScreen(coords, width, height, padding) {{
    return {{
      sx: padding + ((coords[0] - globalMinX) / globalRangeX) * (width - padding * 2),
      sy: height - padding - ((coords[1] - globalMinY) / globalRangeY) * (height - padding * 2),
    }};
  }}

  // ── Assessment (mirrors Python guard logic, runs client-side) ───────────────
  function normalize(s) {{ return s.trim().toLowerCase(); }}
  function stripPluralS(s) {{
    return s.split(" ").filter(Boolean).map(t =>
      t.endsWith("s") && !t.endsWith("ss") ? t.slice(0,-1) : t
    ).join(" ");
  }}
  function singularize(s) {{
    return s.split(" ").filter(Boolean).map(t => {{
      if (t.endsWith("ies") && t.length > 3) return t.slice(0,-3) + "y";
      if (t.endsWith("oes") && t.length > 3) return t.slice(0,-2);
      if ((t.endsWith("ses") || t.endsWith("xes") || t.endsWith("zes"))) return t.slice(0,-2);
      if (t.endsWith("s") && !t.endsWith("ss") && t.length > 2) return t.slice(0,-1);
      return t;
    }}).join(" ");
  }}

  function assessPair(pair, simThreshold, minCount) {{
    const srcCat = (pair.source_category || "").trim() || null;
    const tgtCat = (pair.target_category || "").trim() || null;
    if (srcCat && tgtCat && srcCat !== tgtCat) return "cross_category_requires_manual_review";
    if (pair.direction !== "lateral") return `direction_${{pair.direction}}_requires_manual_review`;

    const src = normalize(pair.source_canonical);
    const tgt = normalize(pair.target_canonical);
    if (!src || !tgt) return "empty_canonical_name";
    if (src === tgt) return "allowed:exact_normalized_match";
    if (stripPluralS(src) === stripPluralS(tgt)) return "allowed:simple_plural_s_match";
    if (singularize(src) === singularize(tgt)) return "allowed:singularized_match";

    const geoMean = Math.sqrt(pair.source.productCount * pair.target.productCount);
    if ((pair.max_similarity || 0) >= simThreshold && geoMean >= minCount)
      return "allowed:weighted_product_count_vector_match";

    return "non_trivial_lateral_variant_requires_manual_review";
  }}

  // ── Render ──────────────────────────────────────────────────────────────────
  let cachedPairScreens = [];

  function resizeCanvas() {{
    const ratio = window.devicePixelRatio || 1;
    const rect  = canvas.getBoundingClientRect();
    canvas.width  = Math.round(rect.width  * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }}

  function draw() {{
    const width   = canvas.getBoundingClientRect().width;
    const height  = canvas.getBoundingClientRect().height;
    const padding = 36;
    const simThreshold = parseFloat(simThreshInput.value);
    const minCount     = parseFloat(minCountInput.value);
    const lineWidth    = parseFloat(lineWidthInput.value);
    const search       = searchInput.value.trim().toLowerCase();
    const showBg       = showBgToggle.checked;
    const scaleByCount = scaleByCountToggle.checked;

    ctx.clearRect(0, 0, width, height);

    // Axes
    ctx.strokeStyle = "rgba(31,42,31,0.10)"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, height/2); ctx.lineTo(width-padding, height/2);
    ctx.moveTo(width/2, padding);  ctx.lineTo(width/2, height-padding);
    ctx.stroke();

    // Background ingredients
    if (showBg) {{
      ctx.globalAlpha = 0.25;
      for (const p of payload.backgroundPoints) {{
        const {{sx, sy}} = toScreen(p.coords, width, height, padding);
        ctx.beginPath();
        ctx.fillStyle = "#9aab9a";
        ctx.arc(sx, sy, 2.5, 0, Math.PI*2);
        ctx.fill();
      }}
      ctx.globalAlpha = 1;
    }}

    // Pairs
    cachedPairScreens = [];

    const visiblePairs = payload.pairs.filter(pair => {{
      const reason = assessPair(pair, simThreshold, minCount);
      if (!enabledReasons.has(pair.staticReason)) return false;
      if (search && !pair.source_canonical.toLowerCase().includes(search) &&
                    !pair.target_canonical.toLowerCase().includes(search)) return false;
      return true;
    }});

    // Draw lines first (behind dots)
    for (const pair of visiblePairs) {{
      if (!pair.source.coords || !pair.target.coords) continue;
      const s = toScreen(pair.source.coords, width, height, padding);
      const t = toScreen(pair.target.coords, width, height, padding);
      const reason = assessPair(pair, simThreshold, minCount);
      const color  = reasonColor(reason);

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = lineWidth;
      ctx.globalAlpha = 0.7;
      ctx.moveTo(s.sx, s.sy);
      ctx.lineTo(t.sx, t.sy);
      ctx.stroke();
    }}

    // Draw dots on top
    ctx.globalAlpha = 1;
    for (const pair of visiblePairs) {{
      if (!pair.source.coords || !pair.target.coords) continue;
      const s = toScreen(pair.source.coords, width, height, padding);
      const t = toScreen(pair.target.coords, width, height, padding);
      const reason = assessPair(pair, simThreshold, minCount);
      const color  = reasonColor(reason);

      for (const [screen, member] of [[s, pair.source], [t, pair.target]]) {{
        const r = scaleByCount
          ? Math.max(3, 5 * (0.4 + 1.6 * Math.sqrt(member.productCount / maxPairProductCount)))
          : 5;
        ctx.beginPath();
        ctx.fillStyle   = color;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth   = 1.5;
        ctx.arc(screen.sx, screen.sy, r, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
      }}

      cachedPairScreens.push({{ pair, s, t, reason }});
    }}
  }}

  // ── Tooltip ─────────────────────────────────────────────────────────────────
  canvas.addEventListener("mousemove", e => {{
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const threshold = 12;

    let best = null, bestDist = Infinity;
    for (const item of cachedPairScreens) {{
      for (const screen of [item.s, item.t]) {{
        const d = Math.hypot(screen.sx - mx, screen.sy - my);
        if (d < threshold && d < bestDist) {{ best = item; bestDist = d; }}
      }}
    }}

    if (!best) {{ tooltip.style.opacity = "0"; return; }}

    const p = best.pair;
    const simThreshold = parseFloat(simThreshInput.value);
    const minCount     = parseFloat(minCountInput.value);
    const liveReason   = assessPair(p, simThreshold, minCount);
    const changed      = liveReason !== p.staticReason
      ? `<br/><em style="color:#a8e6bc">→ ${{reasonLabel(liveReason)}} at current thresholds</em>` : "";

    tooltip.innerHTML =
      `<strong>${{p.source_canonical}}</strong> → <strong>${{p.target_canonical}}</strong><br/>` +
      `Direction: ${{p.direction}}<br/>` +
      `Similarity: ${{(p.max_similarity||0).toFixed(4)}} &nbsp; Events: ${{p.event_count}}<br/>` +
      `Source products: ${{p.source.productCount}} &nbsp; Target products: ${{p.target.productCount}}<br/>` +
      `Category: ${{p.source_category||"—"}} / ${{p.target_category||"—"}}<br/>` +
      `<span style="color:${{reasonColor(p.staticReason)}}">${{reasonLabel(p.staticReason)}}</span>` +
      changed;
    tooltip.style.left    = mx + "px";
    tooltip.style.top     = my + "px";
    tooltip.style.opacity = "1";
  }});
  canvas.addEventListener("mouseleave", () => {{ tooltip.style.opacity = "0"; }});

  // ── Controls wiring ─────────────────────────────────────────────────────────
  simThreshInput.addEventListener("input", () => {{
    simThreshVal.textContent = parseFloat(simThreshInput.value).toFixed(2); draw();
  }});
  minCountInput.addEventListener("input", () => {{
    minCountVal.textContent = minCountInput.value; draw();
  }});
  lineWidthInput.addEventListener("input", () => {{
    lineWidthVal.textContent = lineWidthInput.value; draw();
  }});
  [searchInput, showBgToggle, scaleByCountToggle].forEach(el =>
    el.addEventListener("input", draw)
  );
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
</script>
</body>
</html>"""


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    args    = parse_args()
    supabase = get_supabase()

    print("[Scatter] Fetching consolidation candidates...")
    candidates = fetch_candidates(supabase)
    if not candidates:
        raise SystemExit("No candidates found.")
    print(f"[Scatter] {len(candidates)} candidates")

    # Collect all canonical names from candidates
    candidate_names = list({
        name
        for row in candidates
        for name in (row["source_canonical"], row["target_canonical"])
    })

    print("[Scatter] Fetching ingredient metadata for candidate canonicals...")
    ingredients_by_name = fetch_ingredients_by_name(supabase, candidate_names)
    candidate_ids = [ing["id"] for ing in ingredients_by_name.values()]

    product_counts_by_id   = fetch_product_counts(supabase, candidate_ids)
    product_counts_by_name = {
        name: product_counts_by_id.get(ing["id"], 0)
        for name, ing in ingredients_by_name.items()
    }

    print(f"[Scatter] Fetching all embeddings for model \"{args.model}\"...")
    embedding_rows = fetch_embeddings(supabase, args.model, args.page_size)
    if len(embedding_rows) < 2:
        raise SystemExit(f"Not enough embeddings; found {len(embedding_rows)}.")

    all_ids = list({r["standardized_ingredient_id"] for r in embedding_rows})
    ingredients_by_id = fetch_ingredients(supabase, all_ids)

    # Parse + validate embeddings
    valid_embeddings = []
    for row in embedding_rows:
        vec = parse_embedding(row.get("embedding"))
        ing = ingredients_by_id.get(row["standardized_ingredient_id"])
        if vec and ing:
            valid_embeddings.append((ing, vec))

    if len(valid_embeddings) < 2:
        raise SystemExit("Not enough valid embeddings.")

    dim = len(valid_embeddings[0][1])
    valid_embeddings = [(ing, vec) for ing, vec in valid_embeddings if len(vec) == dim]

    print(f"[Scatter] Running PCA over {len(valid_embeddings):,} embeddings...")
    matrix = np.array([vec for _, vec in valid_embeddings], dtype=np.float32)
    n = min(N_COMPONENTS, matrix.shape[0], matrix.shape[1])
    pca    = PCA(n_components=n)
    coords = pca.fit_transform(matrix)

    # Build canonical_name → PCA coords map
    name_to_coords: dict[str, list[float]] = {}
    for i, (ing, _) in enumerate(valid_embeddings):
        name_to_coords[ing["canonical_name"]] = [float(coords[i, c]) for c in range(n)]

    # Background points (all ingredients)
    background_points = [
        {
            "name":     ing["canonical_name"],
            "category": ing.get("category"),
            "coords":   name_to_coords[ing["canonical_name"]],
        }
        for ing, _ in valid_embeddings
        if ing["canonical_name"] not in set(candidate_names)
    ]

    # Build pair objects
    pairs = []
    for row in candidates:
        src_name = row["source_canonical"]
        tgt_name = row["target_canonical"]
        src_coords = name_to_coords.get(src_name)
        tgt_coords = name_to_coords.get(tgt_name)

        static_reason = assess_candidate(
            row, product_counts_by_name,
            WEIGHTED_SIMILARITY_THRESHOLD, MIN_WEIGHTED_PRODUCT_COUNT
        )

        pairs.append({
            "source_canonical": src_name,
            "target_canonical": tgt_name,
            "direction":        row.get("direction"),
            "max_similarity":   row.get("max_similarity"),
            "min_similarity":   row.get("min_similarity"),
            "event_count":      row.get("event_count"),
            "source_category":  row.get("source_category"),
            "target_category":  row.get("target_category"),
            "staticReason":     static_reason,
            "source": {
                "coords":       src_coords,
                "productCount": product_counts_by_name.get(src_name, 0),
            },
            "target": {
                "coords":       tgt_coords,
                "productCount": product_counts_by_name.get(tgt_name, 0),
            },
        })

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        build_html(background_points, pairs, args.model,
                   WEIGHTED_SIMILARITY_THRESHOLD, MIN_WEIGHTED_PRODUCT_COUNT),
        encoding="utf-8"
    )
    print(f"[Scatter] Wrote {len(pairs)} pairs + {len(background_points):,} background points to {output_path}")


if __name__ == "__main__":
    main()
