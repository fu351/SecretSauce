#!/usr/bin/env python3
"""Visualize ingredient embeddings using PCA."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from sklearn.decomposition import PCA
from supabase import create_client

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent

DEFAULT_OUTPUT = REPO_ROOT / "backend" / "scripts" / "output" / "ingredient-embedding-pca.html"
DEFAULT_PAGE_SIZE = 1000
CHUNK_SIZE = 100
N_COMPONENTS = 10


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
    default_output = str(DEFAULT_OUTPUT)

    parser = argparse.ArgumentParser(
        description="2D PCA visualization of ingredient embeddings.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
  --model    Embedding model to visualize.  Default: {default_model}
  --output   HTML output path.              Default: {default_output}
  --category Only include one category.
  --limit    Only visualize the first N embeddings after filtering.
  --page-size Supabase page size while fetching. Default: {DEFAULT_PAGE_SIZE}
""",
    )
    parser.add_argument("--model", default=default_model)
    parser.add_argument("--output", default=default_output)
    parser.add_argument("--category", default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE)
    return parser.parse_args()


def get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(
            "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )
    return create_client(url, key)


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


def parse_embedding(value) -> list[float] | None:
    """Handle vector values that may arrive as a list or a bracketed string."""
    if isinstance(value, list):
        return [float(v) for v in value]
    if isinstance(value, str):
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            return [float(v) for v in value[1:-1].split(",")]
    return None


def sanitize_html(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_html(points: list[dict], model: str, explained_variance: list[float]) -> str:
    categories = sorted({p["category"] or "uncategorized" for p in points})
    payload = json.dumps(
        {
            "points": points,
            "model": model,
            "categories": categories,
            "explainedVariance": explained_variance,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }
    ).replace("<", "\\u003c")

    count_str = f"{len(points):,}"
    generated_str = sanitize_html(datetime.now().strftime("%c"))
    model_str = sanitize_html(model)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ingredient Embedding PCA</title>
  <style>
    :root {{
      --bg: #f6f0e8;
      --panel: rgba(255, 251, 246, 0.92);
      --ink: #1f2a1f;
      --muted: #5f6b5f;
      --accent: #cb6d51;
      --grid: rgba(31, 42, 31, 0.12);
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
    .sidebar {{
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }}
    h1 {{
      margin: 0;
      font-size: 1.9rem;
      line-height: 1.05;
      letter-spacing: -0.03em;
    }}
    p, label, select, input {{
      font-size: 0.98rem;
    }}
    .muted {{
      color: var(--muted);
    }}
    .statline {{
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.55);
    }}
    .controls {{
      display: grid;
      gap: 12px;
    }}
    .controls label {{
      display: grid;
      gap: 6px;
    }}
    input, select {{
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--border);
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.92);
      color: var(--ink);
    }}
    .canvas-wrap {{
      padding: 16px;
      position: relative;
      min-height: 78vh;
    }}
    canvas {{
      width: 100%;
      height: 78vh;
      display: block;
      border-radius: 16px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,241,234,0.92));
      border: 1px solid var(--border);
    }}
    .tooltip {{
      position: absolute;
      pointer-events: none;
      max-width: 260px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(31, 42, 31, 0.92);
      color: white;
      font-size: 0.9rem;
      transform: translate(12px, 12px);
      opacity: 0;
      transition: opacity 120ms ease;
      white-space: normal;
    }}
    .legend {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }}
    .legend-item {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.68);
      font-size: 0.85rem;
    }}
    .swatch {{
      width: 10px;
      height: 10px;
      border-radius: 999px;
      flex: 0 0 auto;
    }}
    @media (max-width: 980px) {{
      .layout {{
        grid-template-columns: 1fr;
      }}
      .canvas-wrap, canvas {{
        min-height: 64vh;
        height: 64vh;
      }}
    }}
  </style>
</head>
<body>
  <div class="layout">
    <aside class="panel sidebar">
      <div>
        <h1>Ingredient PCA Map</h1>
        <p class="muted">A 2D projection of standardized ingredient embeddings for cluster review.</p>
      </div>
      <div class="statline">
        <strong id="pointCount">{count_str} points</strong>
        <span class="muted">Model: {model_str}</span>
        <span class="muted">Generated: {generated_str}</span>
      </div>
      <div class="controls">
        <label>
          Search name
          <input id="searchInput" type="search" placeholder="paprika, yogurt, garlic..." />
        </label>
        <label>
          Category
          <select id="categorySelect">
            <option value="">All categories</option>
          </select>
        </label>
        <label>
          X axis
          <select id="xAxisSelect"></select>
        </label>
        <label>
          Y axis
          <select id="yAxisSelect"></select>
        </label>
        <label>
          Point size
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
    const canvas = document.getElementById("plot");
    const tooltip = document.getElementById("tooltip");
    const searchInput = document.getElementById("searchInput");
    const categorySelect = document.getElementById("categorySelect");
    const pointSizeInput = document.getElementById("pointSizeInput");
    const scaleByCountToggle = document.getElementById("scaleByCountToggle");
    const xAxisSelect = document.getElementById("xAxisSelect");
    const yAxisSelect = document.getElementById("yAxisSelect");
    const pointCount = document.getElementById("pointCount");
    const maxProductCount = Math.max(1, ...payload.points.map((p) => p.productCount));

    payload.explainedVariance.forEach((v, i) => {{
      const label = `PC${{i + 1}} (${{(v * 100).toFixed(1)}}%)`;
      [xAxisSelect, yAxisSelect].forEach((sel, si) => {{
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = label;
        if (i === si) opt.selected = true;
        sel.appendChild(opt);
      }});
    }});
    const legend = document.getElementById("legend");
    const ctx = canvas.getContext("2d");

    const palette = [
      "#cb6d51", "#6f8f72", "#537d8d", "#d4a24c", "#8b6fb3",
      "#9a4f64", "#5f7d4e", "#b95f3a", "#456e91", "#a07d3b"
    ];

    const colorByCategory = new Map();
    payload.categories.forEach((category, index) => {{
      colorByCategory.set(category, palette[index % palette.length]);
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    }});

    function renderLegend(categories) {{
      legend.innerHTML = "";
      categories.forEach((category) => {{
        const item = document.createElement("div");
        item.className = "legend-item";
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = colorByCategory.get(category);
        const label = document.createElement("span");
        label.textContent = category;
        item.appendChild(swatch);
        item.appendChild(label);
        legend.appendChild(item);
      }});
    }}

    let cachedVisiblePoints = [];
    let cachedScreenPoints = [];

    function resizeCanvas() {{
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    }}

    function getVisiblePoints() {{
      const search = searchInput.value.trim().toLowerCase();
      const category = categorySelect.value;
      return payload.points.filter((point) => {{
        if (category && (point.category || "uncategorized") !== category) return false;
        if (search && !point.name.toLowerCase().includes(search)) return false;
        return true;
      }});
    }}

    function drawAxes(width, height, padding) {{
      ctx.strokeStyle = "rgba(31, 42, 31, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, height / 2);
      ctx.lineTo(width - padding, height / 2);
      ctx.moveTo(width / 2, padding);
      ctx.lineTo(width / 2, height - padding);
      ctx.stroke();
    }}

    function draw() {{
      const width = canvas.getBoundingClientRect().width;
      const height = canvas.getBoundingClientRect().height;
      const padding = 36;
      const pointSize = Number(pointSizeInput.value);

      const visible = getVisiblePoints();
      cachedVisiblePoints = visible;
      pointCount.textContent = visible.length.toLocaleString() + " points";

      const visibleCategories = Array.from(new Set(visible.map((point) => point.category || "uncategorized"))).sort();
      renderLegend(visibleCategories);

      ctx.clearRect(0, 0, width, height);
      drawAxes(width, height, padding);

      if (visible.length === 0) {{
        ctx.fillStyle = "#5f6b5f";
        ctx.font = "16px Georgia";
        ctx.fillText("No points match the current filters.", padding, padding + 10);
        cachedScreenPoints = [];
        return;
      }}

      const xi = Number(xAxisSelect.value);
      const yi = Number(yAxisSelect.value);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const point of visible) {{
        minX = Math.min(minX, point.coords[xi]); maxX = Math.max(maxX, point.coords[xi]);
        minY = Math.min(minY, point.coords[yi]); maxY = Math.max(maxY, point.coords[yi]);
      }}

      const rangeX = Math.max(maxX - minX, 1e-9);
      const rangeY = Math.max(maxY - minY, 1e-9);

      cachedScreenPoints = visible.map((point) => {{
        const sx = padding + ((point.coords[xi] - minX) / rangeX) * (width - padding * 2);
        const sy = height - padding - ((point.coords[yi] - minY) / rangeY) * (height - padding * 2);
        return {{ point, sx, sy }};
      }});

      const scaleByCount = scaleByCountToggle.checked;
      for (const {{ point, sx, sy }} of cachedScreenPoints) {{
        const radius = scaleByCount
          ? Math.max(2, pointSize * (0.5 + 2.5 * Math.sqrt(point.productCount / maxProductCount)))
          : pointSize;
        ctx.beginPath();
        ctx.fillStyle = colorByCategory.get(point.category || "uncategorized") || "#cb6d51";
        ctx.globalAlpha = 0.8;
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }}

      ctx.globalAlpha = 1;
    }}

    canvas.addEventListener("mousemove", (event) => {{
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const threshold = Math.max(Number(pointSizeInput.value) + 3, 8);

      let best = null, bestDistance = Infinity;
      for (const candidate of cachedScreenPoints) {{
        const dx = candidate.sx - x, dy = candidate.sy - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < threshold && distance < bestDistance) {{
          best = candidate;
          bestDistance = distance;
        }}
      }}

      if (!best) {{ tooltip.style.opacity = "0"; return; }}

      const xi = Number(xAxisSelect.value), yi = Number(yAxisSelect.value);
      tooltip.innerHTML =
        "<strong>" + best.point.name + "</strong><br/>" +
        "Category: " + (best.point.category || "uncategorized") + "<br/>" +
        "Products: " + best.point.productCount.toLocaleString() + "<br/>" +
        "Source: " + best.point.inputText + "<br/>" +
        "PC" + (xi+1) + ": " + best.point.coords[xi].toFixed(3) + " &nbsp; PC" + (yi+1) + ": " + best.point.coords[yi].toFixed(3);
      tooltip.style.left = x + "px";
      tooltip.style.top = y + "px";
      tooltip.style.opacity = "1";
    }});

    canvas.addEventListener("mouseleave", () => {{ tooltip.style.opacity = "0"; }});
    searchInput.addEventListener("input", draw);
    categorySelect.addEventListener("change", draw);
    xAxisSelect.addEventListener("change", draw);
    yAxisSelect.addEventListener("change", draw);
    pointSizeInput.addEventListener("input", draw);
    scaleByCountToggle.addEventListener("change", draw);
    window.addEventListener("resize", resizeCanvas);

    resizeCanvas();
  </script>
</body>
</html>"""


def main() -> None:
    args = parse_args()
    supabase = get_supabase()

    print(f'[PCA] Fetching ingredient embeddings for model "{args.model}"...')
    embedding_rows = fetch_embeddings(supabase, args.model, args.page_size, args.limit)

    if len(embedding_rows) < 2:
        raise SystemExit(
            f"Need at least 2 ingredient embeddings for PCA; found {len(embedding_rows)}."
        )

    ingredient_ids = list({row["standardized_ingredient_id"] for row in embedding_rows})
    ingredients_by_id = fetch_ingredients(supabase, ingredient_ids)
    product_counts = fetch_product_counts(supabase, ingredient_ids)

    joined = []
    for row in embedding_rows:
        ingredient = ingredients_by_id.get(row["standardized_ingredient_id"])
        if not ingredient:
            continue
        if args.category and ingredient.get("category") != args.category:
            continue
        vec = parse_embedding(row.get("embedding"))
        if not vec:
            continue
        joined.append((row, ingredient, vec))

    if len(joined) < 2:
        raise SystemExit(f"Need at least 2 joined rows after filtering; found {len(joined)}.")

    # Validate consistent dimensions
    dim = len(joined[0][2])
    valid = [(r, ing, vec) for r, ing, vec in joined if len(vec) == dim]
    if len(valid) < 2:
        raise SystemExit("No valid embedding vectors were available for PCA.")

    matrix = np.array([vec for _, _, vec in valid], dtype=np.float32)
    print(f"[PCA] Running 2D PCA over {len(valid):,} embeddings...")

    n_components = min(N_COMPONENTS, matrix.shape[0], matrix.shape[1])
    pca = PCA(n_components=n_components)
    coords = pca.fit_transform(matrix)
    explained_variance = [round(float(v), 4) for v in pca.explained_variance_ratio_]

    points = [
        {
            "id": ing["id"],
            "name": ing["canonical_name"],
            "category": ing.get("category"),
            "model": row["model"],
            "inputText": row["input_text"],
            "productCount": product_counts.get(ing["id"], 0),
            "coords": [float(coords[i, c]) for c in range(n_components)],
        }
        for i, (row, ing, _) in enumerate(valid)
    ]

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(build_html(points, args.model, explained_variance), encoding="utf-8")

    print(f"[PCA] Wrote {len(points):,} points to {output_path}")


if __name__ == "__main__":
    main()
