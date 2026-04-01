#!/usr/bin/env python3
"""Find optimized cluster projections using a weighted Lp-norm.

Each embedding is weighted by the number of products that use its standardized
ingredient, so high-traffic ingredients exert greater pull on the projection axes.

The Lp objective per axis:  maximize_v  Σ_i  w_i · |xᵢ · v|^p
  p = 2  →  weighted PCA (exact, via weighted SVD)
  p = 1  →  weighted L1 projection (robust to outliers, solved via IRLS)
  other  →  general Lp via Riemannian gradient ascent

Tune the parameters in the Configuration block below.
"""

from __future__ import annotations

# ── Configuration ──────────────────────────────────────────────────────────────
N_COMPONENTS = 10    # Number of projection axes to pre-compute
P_NORM       = 2.0   # Lp exponent: 2 = weighted PCA, 1 = L1, 1.5 = intermediate
MAX_ITER     = 500   # Max iterations for iterative solver (ignored when p == 2)
TOL          = 1e-8  # Convergence tolerance
# ───────────────────────────────────────────────────────────────────────────────

import argparse
import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from supabase import create_client

SCRIPT_DIR   = Path(__file__).resolve().parent
REPO_ROOT    = SCRIPT_DIR.parent.parent.parent
DEFAULT_OUTPUT = REPO_ROOT / "backend" / "scripts" / "output" / "ingredient-weighted-projection.html"
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
    parser.add_argument("--category",  default=None)
    parser.add_argument("--limit",     type=int,   default=None)
    parser.add_argument("--page-size", type=int,   default=DEFAULT_PAGE_SIZE)
    parser.add_argument("--p-norm",    type=float, default=P_NORM,
                        help="Lp exponent (default: %(default)s)")
    parser.add_argument("--n-components", type=int, default=N_COMPONENTS,
                        help="Number of projection axes (default: %(default)s)")
    return parser.parse_args()


def get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    return create_client(url, key)


# ── Data fetching ──────────────────────────────────────────────────────────────

def fetch_embeddings(supabase, model: str, page_size: int, limit: int | None) -> list[dict]:
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
        if limit and len(rows) >= limit:
            return rows[:limit]
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
            .select("id, canonical_name, category, is_food_item")
            .in_("id", chunk)
            .execute()
        )
        for row in resp.data or []:
            by_id[row["id"]] = row
    return by_id


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


# ── Weighted Lp projection ─────────────────────────────────────────────────────

def weighted_mean(X: np.ndarray, w: np.ndarray) -> np.ndarray:
    return (w[:, None] * X).sum(axis=0)


def weighted_l2_projection(
    X: np.ndarray, w: np.ndarray, n_components: int
) -> tuple[np.ndarray, np.ndarray, list[float]]:
    """Exact weighted PCA via weighted SVD.

    Scales each row by sqrt(w_i) so that the left singular vectors of the
    scaled matrix correspond to the eigenvectors of the weighted covariance.
    """
    Xw = X * np.sqrt(w[:, None])
    _, S, Vt = np.linalg.svd(Xw, full_matrices=False)
    components = Vt[:n_components]
    coords = X @ components.T
    total = float((S ** 2).sum())
    explained = [float(S[i] ** 2) / total for i in range(n_components)]
    return coords, components, explained


def _lp_axis(
    X: np.ndarray,
    w: np.ndarray,
    p: float,
    prior_components: list[np.ndarray],
    max_iter: int,
    tol: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """Find a single Lp-optimal projection axis via Riemannian gradient ascent.

    Objective: maximize  Σ_i w_i · |xᵢ · v|^p  subject to ‖v‖ = 1.
    Gradient on the sphere: g = p · Xᵀ (w · |Xv|^(p-1) · sign(Xv)) — projected.
    Uses Nesterov-style momentum on the tangent space.
    """
    dim = X.shape[1]
    v = rng.standard_normal(dim)
    # Orthogonalise against prior components before starting
    for c in prior_components:
        v -= (v @ c) * c
    norm = np.linalg.norm(v)
    if norm < 1e-12:
        v = rng.standard_normal(dim)
        norm = np.linalg.norm(v)
    v /= norm

    step = 0.01
    momentum = np.zeros(dim)
    prev_obj = -np.inf

    for _ in range(max_iter):
        proj = X @ v                            # (n,)
        abs_proj = np.abs(proj)
        sign_proj = np.sign(proj)

        # Gradient of objective w.r.t. v
        grad = p * (X.T @ (w * (abs_proj ** (p - 1)) * sign_proj))

        # Project gradient onto tangent space of sphere at v
        grad -= (grad @ v) * v

        # Orthogonalise gradient against prior components
        for c in prior_components:
            grad -= (grad @ c) * c

        # Momentum update
        momentum = 0.9 * momentum + step * grad
        v_new = v + momentum
        v_new /= np.linalg.norm(v_new)

        # Re-orthogonalise against prior
        for c in prior_components:
            v_new -= (v_new @ c) * c
        n2 = np.linalg.norm(v_new)
        if n2 < 1e-12:
            break
        v_new /= n2

        obj = float((w * np.abs(X @ v_new) ** p).sum())
        if obj < prev_obj:
            step *= 0.5
            momentum *= 0
        else:
            prev_obj = obj
            if np.linalg.norm(v_new - v) < tol:
                v = v_new
                break
            v = v_new

    return v


def weighted_lp_projection(
    X: np.ndarray,
    w: np.ndarray,
    p: float,
    n_components: int,
    max_iter: int = MAX_ITER,
    tol: float = TOL,
) -> tuple[np.ndarray, np.ndarray, list[float]]:
    """General weighted Lp projection via sequential axis optimization."""
    rng = np.random.default_rng(42)
    components: list[np.ndarray] = []

    for k in range(n_components):
        print(f"  [axis {k+1}/{n_components}]", end="\r", flush=True)
        v = _lp_axis(X, w, p, components, max_iter, tol, rng)
        components.append(v)

    print()
    comp_matrix = np.stack(components, axis=0)  # (n_components, dim)
    coords = X @ comp_matrix.T

    # Compute explained "power" in the Lp sense for each axis
    total_power = float((w * np.linalg.norm(X, ord=p, axis=1) ** p).sum()) or 1.0
    explained = [
        float((w * np.abs(X @ components[k]) ** p).sum()) / total_power
        for k in range(n_components)
    ]
    return coords, comp_matrix, explained


# ── HTML output ────────────────────────────────────────────────────────────────

def sanitize_html(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_html(points: list[dict], model: str, explained: list[float], p_norm: float) -> str:
    categories = sorted({p["category"] or "uncategorized" for p in points})
    payload = json.dumps(
        {
            "points": points,
            "model": model,
            "categories": categories,
            "explainedPower": explained,
            "pNorm": p_norm,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }
    ).replace("<", "\\u003c")

    count_str   = f"{len(points):,}"
    model_str   = sanitize_html(model)
    generated   = sanitize_html(datetime.now().strftime("%c"))
    p_str       = sanitize_html(str(p_norm))

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Weighted L{p_str} Projection</title>
  <style>
    :root {{
      --bg: #f6f0e8;
      --panel: rgba(255, 251, 246, 0.92);
      --ink: #1f2a1f;
      --muted: #5f6b5f;
      --accent: #cb6d51;
      --border: rgba(31, 42, 31, 0.14);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(203, 109, 81, 0.16), transparent 28%),
        radial-gradient(circle at top right, rgba(111, 143, 114, 0.18), transparent 32%),
        linear-gradient(180deg, #f8f2eb 0%, #efe7dd 100%);
      min-height: 100vh;
    }}
    .layout {{
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 20px;
      padding: 20px;
    }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      backdrop-filter: blur(10px);
      box-shadow: 0 18px 50px rgba(74, 53, 39, 0.08);
    }}
    .sidebar {{ padding: 20px; display: flex; flex-direction: column; gap: 18px; }}
    h1 {{ margin: 0; font-size: 1.75rem; line-height: 1.05; letter-spacing: -0.03em; }}
    p, label, select, input {{ font-size: 0.98rem; }}
    .muted {{ color: var(--muted); }}
    .statline {{
      display: grid; gap: 8px; padding: 14px;
      border: 1px solid var(--border); border-radius: 14px;
      background: rgba(255, 255, 255, 0.55);
    }}
    .controls {{ display: grid; gap: 12px; }}
    .controls label {{ display: grid; gap: 6px; }}
    input, select {{
      width: 100%; border-radius: 10px; border: 1px solid var(--border);
      padding: 10px 12px; background: rgba(255, 255, 255, 0.92); color: var(--ink);
    }}
    .canvas-wrap {{ padding: 16px; position: relative; min-height: 78vh; }}
    canvas {{
      width: 100%; height: 78vh; display: block; border-radius: 16px;
      background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,241,234,0.92));
      border: 1px solid var(--border);
    }}
    .tooltip {{
      position: absolute; pointer-events: none; max-width: 280px;
      padding: 10px 12px; border-radius: 12px;
      background: rgba(31, 42, 31, 0.92); color: white; font-size: 0.9rem;
      transform: translate(12px, 12px); opacity: 0;
      transition: opacity 120ms ease; white-space: normal;
    }}
    .legend {{ display: flex; flex-wrap: wrap; gap: 8px; }}
    .legend-item {{
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 10px; border-radius: 999px;
      border: 1px solid var(--border); background: rgba(255,255,255,0.68);
      font-size: 0.85rem;
    }}
    .swatch {{ width: 10px; height: 10px; border-radius: 999px; flex: 0 0 auto; }}
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
        <h1>Weighted L{p_str} Projection</h1>
        <p class="muted">Projection axes optimized by product-count-weighted L{p_str}-norm. Axes ranked by explained Lp power.</p>
      </div>
      <div class="statline">
        <strong id="pointCount">{count_str} points</strong>
        <span class="muted">Model: {model_str}</span>
        <span class="muted">L{p_str} norm &nbsp;·&nbsp; product-count weighted</span>
        <span class="muted">Generated: {generated}</span>
      </div>
      <div class="controls">
        <label>Search name
          <input id="searchInput" type="search" placeholder="paprika, yogurt, garlic..." />
        </label>
        <label>Category
          <select id="categorySelect"><option value="">All categories</option></select>
        </label>
        <label>X axis
          <select id="xAxisSelect"></select>
        </label>
        <label>Y axis
          <select id="yAxisSelect"></select>
        </label>
        <label>Point size
          <input id="pointSizeInput" type="range" min="2" max="10" step="1" value="4" />
        </label>
        <label style="flex-direction:row;align-items:center;gap:8px;">
          <input id="scaleByCountToggle" type="checkbox" style="width:auto;" />
          Scale by product count
        </label>
      </div>
      <div>
        <p class="muted">Visible categories</p>
        <div id="legend" class="legend"></div>
      </div>
    </aside>
    <main class="panel canvas-wrap">
      <canvas id="plot"></canvas>
      <div id="tooltip" class="tooltip"></div>
    </main>
  </div>
  <script id="payload" type="application/json">{payload}</script>
  <script>
    const payload = JSON.parse(document.getElementById("payload").textContent);
    const canvas   = document.getElementById("plot");
    const tooltip  = document.getElementById("tooltip");
    const searchInput       = document.getElementById("searchInput");
    const categorySelect    = document.getElementById("categorySelect");
    const xAxisSelect       = document.getElementById("xAxisSelect");
    const yAxisSelect       = document.getElementById("yAxisSelect");
    const pointSizeInput    = document.getElementById("pointSizeInput");
    const scaleByCountToggle = document.getElementById("scaleByCountToggle");
    const pointCountEl      = document.getElementById("pointCount");
    const legend            = document.getElementById("legend");
    const ctx               = canvas.getContext("2d");

    const maxProductCount = Math.max(1, ...payload.points.map(p => p.productCount));

    const palette = [
      "#cb6d51","#6f8f72","#537d8d","#d4a24c","#8b6fb3",
      "#9a4f64","#5f7d4e","#b95f3a","#456e91","#a07d3b"
    ];

    const colorByCategory = new Map();
    payload.categories.forEach((cat, i) => {{
      colorByCategory.set(cat, palette[i % palette.length]);
      const opt = document.createElement("option");
      opt.value = cat; opt.textContent = cat;
      categorySelect.appendChild(opt);
    }});

    payload.explainedPower.forEach((v, i) => {{
      const label = `Axis ${{i+1}} (${{(v*100).toFixed(1)}}%)`;
      [xAxisSelect, yAxisSelect].forEach((sel, si) => {{
        const opt = document.createElement("option");
        opt.value = i; opt.textContent = label;
        if (i === si) opt.selected = true;
        sel.appendChild(opt);
      }});
    }});

    function renderLegend(cats) {{
      legend.innerHTML = "";
      cats.forEach(cat => {{
        const item = document.createElement("div");
        item.className = "legend-item";
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.background = colorByCategory.get(cat);
        const lbl = document.createElement("span");
        lbl.textContent = cat;
        item.appendChild(sw); item.appendChild(lbl);
        legend.appendChild(item);
      }});
    }}

    let cachedVisible = [], cachedScreen = [];

    function getVisible() {{
      const search = searchInput.value.trim().toLowerCase();
      const cat    = categorySelect.value;
      return payload.points.filter(p => {{
        if (cat && (p.category || "uncategorized") !== cat) return false;
        if (search && !p.name.toLowerCase().includes(search)) return false;
        return true;
      }});
    }}

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
      const baseSize = Number(pointSizeInput.value);
      const xi = Number(xAxisSelect.value);
      const yi = Number(yAxisSelect.value);
      const scaleByCount = scaleByCountToggle.checked;

      const visible = getVisible();
      cachedVisible = visible;
      pointCountEl.textContent = visible.length.toLocaleString() + " points";

      const visCats = [...new Set(visible.map(p => p.category || "uncategorized"))].sort();
      renderLegend(visCats);

      ctx.clearRect(0, 0, width, height);

      // Axes
      ctx.strokeStyle = "rgba(31,42,31,0.12)"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, height/2); ctx.lineTo(width-padding, height/2);
      ctx.moveTo(width/2, padding);  ctx.lineTo(width/2, height-padding);
      ctx.stroke();

      if (visible.length === 0) {{
        ctx.fillStyle = "#5f6b5f"; ctx.font = "16px Georgia";
        ctx.fillText("No points match the current filters.", padding, padding+10);
        cachedScreen = []; return;
      }}

      let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
      for (const p of visible) {{
        minX = Math.min(minX, p.coords[xi]); maxX = Math.max(maxX, p.coords[xi]);
        minY = Math.min(minY, p.coords[yi]); maxY = Math.max(maxY, p.coords[yi]);
      }}
      const rangeX = Math.max(maxX-minX, 1e-9);
      const rangeY = Math.max(maxY-minY, 1e-9);

      cachedScreen = visible.map(p => ({{
        p,
        sx: padding + ((p.coords[xi]-minX)/rangeX)*(width-padding*2),
        sy: height-padding - ((p.coords[yi]-minY)/rangeY)*(height-padding*2),
      }}));

      for (const {{p, sx, sy}} of cachedScreen) {{
        const radius = scaleByCount
          ? Math.max(2, baseSize*(0.5 + 2.5*Math.sqrt(p.productCount/maxProductCount)))
          : baseSize;
        ctx.beginPath();
        ctx.fillStyle = colorByCategory.get(p.category || "uncategorized") || "#cb6d51";
        ctx.globalAlpha = 0.8;
        ctx.arc(sx, sy, radius, 0, Math.PI*2);
        ctx.fill();
      }}
      ctx.globalAlpha = 1;
    }}

    canvas.addEventListener("mousemove", e => {{
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX-rect.left, my = e.clientY-rect.top;
      const xi = Number(xAxisSelect.value), yi = Number(yAxisSelect.value);
      const threshold = Math.max(Number(pointSizeInput.value)+3, 8);

      let best=null, bestDist=Infinity;
      for (const c of cachedScreen) {{
        const d = Math.hypot(c.sx-mx, c.sy-my);
        if (d < threshold && d < bestDist) {{ best=c; bestDist=d; }}
      }}

      if (!best) {{ tooltip.style.opacity="0"; return; }}
      tooltip.innerHTML =
        `<strong>${{best.p.name}}</strong><br/>` +
        `Category: ${{best.p.category || "uncategorized"}}<br/>` +
        `Products: ${{best.p.productCount.toLocaleString()}}<br/>` +
        `Source: ${{best.p.inputText}}<br/>` +
        `Axis ${{xi+1}}: ${{best.p.coords[xi].toFixed(4)}} &nbsp; Axis ${{yi+1}}: ${{best.p.coords[yi].toFixed(4)}}`;
      tooltip.style.left = mx+"px";
      tooltip.style.top  = my+"px";
      tooltip.style.opacity = "1";
    }});

    canvas.addEventListener("mouseleave", () => {{ tooltip.style.opacity="0"; }});
    [searchInput, categorySelect, xAxisSelect, yAxisSelect,
     pointSizeInput, scaleByCountToggle].forEach(el => {{
      el.addEventListener(el.type==="range"||el.tagName==="SELECT" ? "input" : "input", draw);
      el.addEventListener("change", draw);
    }});
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
  </script>
</body>
</html>"""


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()
    p    = args.p_norm
    n    = args.n_components
    supabase = get_supabase()

    print(f'[Proj] Fetching embeddings for model "{args.model}"...')
    embedding_rows = fetch_embeddings(supabase, args.model, args.page_size, args.limit)
    if len(embedding_rows) < 2:
        raise SystemExit(f"Need at least 2 embeddings; found {len(embedding_rows)}.")

    ingredient_ids   = list({r["standardized_ingredient_id"] for r in embedding_rows})
    ingredients_by_id = fetch_ingredients(supabase, ingredient_ids)
    product_counts    = fetch_product_counts(supabase, ingredient_ids)

    joined = []
    for row in embedding_rows:
        ing = ingredients_by_id.get(row["standardized_ingredient_id"])
        if not ing:
            continue
        if args.category and ing.get("category") != args.category:
            continue
        vec = parse_embedding(row.get("embedding"))
        if not vec:
            continue
        joined.append((row, ing, vec))

    if len(joined) < 2:
        raise SystemExit(f"Need at least 2 joined rows; found {len(joined)}.")

    dim   = len(joined[0][2])
    valid = [(r, ing, vec) for r, ing, vec in joined if len(vec) == dim]
    if len(valid) < 2:
        raise SystemExit("No valid embedding vectors available.")

    X = np.array([vec for _, _, vec in valid], dtype=np.float64)
    n = min(n, X.shape[0], X.shape[1])

    # Build weight vector from product counts (floor at 1 so unlinked ingredients still contribute)
    raw_weights = np.array(
        [max(1, product_counts.get(ing["id"], 0)) for _, ing, _ in valid], dtype=np.float64
    )
    weights = raw_weights / raw_weights.sum()

    # Mean-centre using weighted mean
    mean = weighted_mean(X, weights)
    Xc   = X - mean

    print(f"[Proj] Computing {n} weighted L{p}-norm axes over {len(valid):,} embeddings...")
    if p == 2.0:
        coords, _, explained = weighted_l2_projection(Xc, weights, n)
    else:
        coords, _, explained = weighted_lp_projection(Xc, weights, p, n, MAX_ITER, TOL)

    points = [
        {
            "id":           ing["id"],
            "name":         ing["canonical_name"],
            "category":     ing.get("category"),
            "model":        row["model"],
            "inputText":    row["input_text"],
            "productCount": product_counts.get(ing["id"], 0),
            "coords":       [float(coords[i, c]) for c in range(n)],
        }
        for i, (row, ing, _) in enumerate(valid)
    ]

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(build_html(points, args.model, explained, p), encoding="utf-8")
    print(f"[Proj] Wrote {len(points):,} points to {output_path}")


if __name__ == "__main__":
    main()
