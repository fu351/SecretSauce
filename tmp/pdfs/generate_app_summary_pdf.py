from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Sequence

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "output" / "pdf"
TMP_DIR = ROOT / "tmp" / "pdfs"
PDF_PATH = OUTPUT_DIR / "secret-sauce-app-summary.pdf"
PNG_PATH = TMP_DIR / "secret-sauce-app-summary-preview.png"
LOGO_PATH = ROOT / "public" / "logo-dark.png"

PAGE_WIDTH = 1700
PAGE_HEIGHT = 2200
MARGIN = 110
GUTTER = 70
LEFT_COL_W = 860
RIGHT_COL_W = PAGE_WIDTH - (MARGIN * 2) - GUTTER - LEFT_COL_W

BG = "#F8F4EC"
TEXT = "#151515"
MUTED = "#5F5B52"
LINE = "#D8D1C2"
ACCENT = "#B88B2E"
ACCENT_DARK = "#8A6721"
PANEL = "#FFFDF9"
NOT_FOUND = "#8A2C2C"


def load_font(size: int, bold: bool = False, serif: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates: List[str] = []
    if serif and bold:
      candidates.extend(
          [
              r"C:\Windows\Fonts\georgiab.ttf",
              r"C:\Windows\Fonts\timesbd.ttf",
          ]
      )
    elif serif:
      candidates.extend(
          [
              r"C:\Windows\Fonts\georgia.ttf",
              r"C:\Windows\Fonts\times.ttf",
          ]
      )
    elif bold:
      candidates.extend(
          [
              r"C:\Windows\Fonts\segoeuib.ttf",
              r"C:\Windows\Fonts\arialbd.ttf",
          ]
      )
    else:
      candidates.extend(
          [
              r"C:\Windows\Fonts\segoeui.ttf",
              r"C:\Windows\Fonts\arial.ttf",
          ]
      )

    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


FONT_TITLE = load_font(60, bold=True, serif=True)
FONT_SUBTITLE = load_font(24)
FONT_SECTION = load_font(28, bold=True)
FONT_BODY = load_font(22)
FONT_BODY_BOLD = load_font(22, bold=True)
FONT_BULLET = load_font(21)
FONT_SMALL = load_font(18)
FONT_FOOTER = load_font(15)


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> float:
    return draw.textlength(text, font=font)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> List[str]:
    if not text:
        return [""]

    lines: List[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue

        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            if text_width(draw, candidate, font) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def line_height(font: ImageFont.ImageFont, extra: int = 0) -> int:
    bbox = font.getbbox("Ag")
    return (bbox[3] - bbox[1]) + extra


def draw_wrapped_text(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    font: ImageFont.ImageFont,
    fill: str,
    max_width: int,
    spacing: int = 8,
) -> int:
    current_y = y
    step = line_height(font, spacing)
    for line in wrap_text(draw, text, font, max_width):
        draw.text((x, current_y), line, font=font, fill=fill)
        current_y += step
    return current_y


def draw_label(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, value: str, max_width: int) -> int:
    draw.text((x, y), label, font=FONT_BODY_BOLD, fill=TEXT)
    label_w = int(text_width(draw, label, FONT_BODY_BOLD))
    return draw_wrapped_text(
        draw,
        x + label_w + 8,
        y,
        value,
        FONT_BODY,
        TEXT,
        max_width - label_w - 8,
        spacing=7,
    )


def draw_bullets(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    bullets: Sequence[str],
    max_width: int,
    font: ImageFont.ImageFont,
    fill: str = TEXT,
) -> int:
    current_y = y
    bullet_gap = 12
    wrap_width = max_width - 36
    line_step = line_height(font, 6)
    for bullet in bullets:
        draw.ellipse((x, current_y + 10, x + 10, current_y + 20), fill=ACCENT)
        first_line_x = x + 24
        lines = wrap_text(draw, bullet, font, wrap_width)
        for i, line in enumerate(lines):
            draw.text((first_line_x, current_y + (i * line_step)), line, font=font, fill=fill)
        current_y += (len(lines) * line_step) + bullet_gap
    return current_y


def section_header(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, title: str) -> int:
    draw.text((x, y), title.upper(), font=FONT_SECTION, fill=ACCENT_DARK)
    y += 44
    draw.line((x, y, x + width, y), fill=LINE, width=2)
    return y + 24


def add_logo(base: Image.Image) -> None:
    if not LOGO_PATH.exists():
        return
    logo = Image.open(LOGO_PATH).convert("RGBA")
    logo.thumbnail((105, 105))
    base.alpha_composite(logo, (MARGIN, 78))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    image = Image.new("RGBA", (PAGE_WIDTH, PAGE_HEIGHT), BG)
    draw = ImageDraw.Draw(image)

    add_logo(image)

    draw.rounded_rectangle(
        (MARGIN, 60, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 72),
        radius=34,
        outline=LINE,
        width=3,
        fill=BG,
    )

    title_x = MARGIN + 132
    draw.text((title_x, 86), "Secret Sauce", font=FONT_TITLE, fill=TEXT)
    draw.text(
        (title_x, 160),
        "Repo-grounded one-page app summary",
        font=FONT_SUBTITLE,
        fill=MUTED,
    )
    draw.text(
        (PAGE_WIDTH - MARGIN - 380, 96),
        "Generated from repo evidence only",
        font=FONT_SMALL,
        fill=MUTED,
    )
    draw.rounded_rectangle(
        (PAGE_WIDTH - MARGIN - 270, 138, PAGE_WIDTH - MARGIN - 20, 184),
        radius=16,
        fill="#EFE7D6",
        outline=LINE,
    )
    draw.text(
        (PAGE_WIDTH - MARGIN - 248, 149),
        "Single-page PDF deliverable",
        font=FONT_SMALL,
        fill=ACCENT_DARK,
    )

    top_y = 235
    draw.line((MARGIN, top_y, PAGE_WIDTH - MARGIN, top_y), fill=LINE, width=2)

    left_x = MARGIN + 30
    right_x = left_x + LEFT_COL_W + GUTTER
    left_y = top_y + 36
    right_y = top_y + 36

    left_y = section_header(draw, left_x, left_y, LEFT_COL_W, "What It Is")
    left_y = draw_wrapped_text(
        draw,
        left_x,
        left_y,
        "Secret Sauce is a recipe management and smart grocery shopping app that helps users discover recipes, plan meals, track pantry items, and compare grocery prices across stores.",
        FONT_BODY,
        TEXT,
        LEFT_COL_W,
        spacing=8,
    )
    left_y += 10
    left_y = draw_wrapped_text(
        draw,
        left_x,
        left_y,
        "Its core differentiator in the repo is an AI-driven ingredient standardization pipeline that normalizes ingredients across recipes and maps them to real store products.",
        FONT_BODY,
        TEXT,
        LEFT_COL_W,
        spacing=8,
    )
    left_y += 24

    left_y = section_header(draw, left_x, left_y, LEFT_COL_W, "Who It Is For")
    left_y = draw_wrapped_text(
        draw,
        left_x,
        left_y,
        "Primary persona: budget-conscious students - especially Berkeley students - who want to eat better, save money, and reduce meal-planning stress.",
        FONT_BODY,
        TEXT,
        LEFT_COL_W,
        spacing=8,
    )
    left_y += 24

    left_y = section_header(draw, left_x, left_y, LEFT_COL_W, "What It Does")
    feature_bullets = [
        "Recipe browsing plus recipe CRUD surfaces (`/recipes`, `/recipes/[id]`, `/upload-recipe`, `/edit-recipe/[id]`).",
        "Weekly meal planning with premium gating on `/meal-planner`.",
        "Pantry tracking with pantry-context ingredient standardization via `POST /api/ingredients/standardize`.",
        "Shopping list management and multi-store price comparison across routes like `/shopping`, `/store`, and `/api/shopping/comparison`.",
        "Recipe import from URL, Instagram, image/OCR, and paragraph text through `app/api/recipe-import/*` and the Python API.",
        "User onboarding, settings, tutorials, and account flows using Clerk-backed auth plus profile bridging.",
        "Premium billing and subscription sync through Stripe checkout and webhook routes.",
    ]
    left_y = draw_bullets(draw, left_x, left_y, feature_bullets, LEFT_COL_W, FONT_BULLET)

    right_y = section_header(draw, right_x, right_y, RIGHT_COL_W, "How It Works")
    architecture_bullets = [
        "Frontend: Next.js App Router routes in `app/`, shared UI in `components/`, and global providers in `app/layout.tsx` for Clerk, theme, React Query, auth, analytics, and tutorials.",
        "Client data layer: hooks and `lib/database/*` wrappers read and write app data instead of pages querying tables directly.",
        "API layer: `app/api/*` handles auth/profile bridging, grocery search and comparison, maps and location, checkout, and recipe-import proxy routes.",
        "Primary data store: Supabase-backed profile, recipe, shopping, embedding, and canonical ingredient tables referenced throughout `lib/database/*` and docs.",
        "Import service: `python-api/main.py` exposes FastAPI endpoints for URL scraping, Instagram parsing, OCR/text parsing, and grocery scraper orchestration.",
        "Background processing: `backend/orchestrators/*` and `backend/workers/*` run ingredient matching, embeddings, vector double-checks, canonical consolidation/medoid, daily scraping, and store maintenance.",
        "High-level flow: UI -> Next routes or DB wrappers -> Supabase. Import flows -> Next API -> Python API -> external parsers/AI. Workers read and write Supabase queues, embeddings, and canonical tables.",
    ]
    right_y = draw_bullets(draw, right_x, right_y, architecture_bullets, RIGHT_COL_W, FONT_BULLET)
    right_y += 8

    right_y = section_header(draw, right_x, right_y, RIGHT_COL_W, "How To Run")
    run_bullets = [
        "Install JS dependencies: exact install command is Not found in repo.",
        "Create `.env.local`: template/example file is Not found in repo. `docs/api-and-integrations.md` lists required Clerk, Supabase, Stripe, Google Maps, and `PYTHON_SERVICE_URL` values.",
        "Start the web app with `npm run dev`.",
        "Optional local services: `python-api/main.py` contains the FastAPI import service, and `docker-compose.local.yml` plus `docker/compose/local/*` define worker and scraper stacks.",
    ]

    bullet_start_y = right_y
    right_y = draw_bullets(draw, right_x, right_y, run_bullets[:3], RIGHT_COL_W, FONT_BULLET)

    last_bullet = run_bullets[3]
    draw.ellipse((right_x, right_y + 10, right_x + 10, right_y + 20), fill=ACCENT)
    bullet_text_x = right_x + 24
    lines = wrap_text(draw, last_bullet, FONT_BULLET, RIGHT_COL_W - 36)
    step = line_height(FONT_BULLET, 6)
    for i, line in enumerate(lines):
        fill = NOT_FOUND if "Not found in repo" in line else TEXT
        draw.text((bullet_text_x, right_y + (i * step)), line, font=FONT_BULLET, fill=fill)
    right_y += (len(lines) * step) + 12

    # Highlight the explicit missing pieces.
    callout_y = max(right_y + 10, bullet_start_y + 360)
    draw.rounded_rectangle(
        (right_x, callout_y, right_x + RIGHT_COL_W, callout_y + 152),
        radius=22,
        fill=PANEL,
        outline=LINE,
        width=2,
    )
    draw.text((right_x + 24, callout_y + 22), "Explicit Gaps", font=FONT_BODY_BOLD, fill=TEXT)
    draw.text((right_x + 24, callout_y + 58), "Install command: Not found in repo", font=FONT_SMALL, fill=NOT_FOUND)
    draw.text((right_x + 24, callout_y + 86), ".env example/template: Not found in repo", font=FONT_SMALL, fill=NOT_FOUND)
    draw.text((right_x + 24, callout_y + 114), "Python local launch docs: Not found in repo", font=FONT_SMALL, fill=NOT_FOUND)

    footer_y = PAGE_HEIGHT - 138
    draw.line((MARGIN + 24, footer_y, PAGE_WIDTH - MARGIN - 24, footer_y), fill=LINE, width=2)
    footer_text = (
        "Sources used: docs/product-overview.md, docs/architecture-and-surfaces.md, "
        "docs/api-and-integrations.md, docs/operations-and-workflows.md, package.json, "
        "app/layout.tsx, app/home/page.tsx, components/landing/landing-page.tsx, python-api/main.py."
    )
    draw_wrapped_text(
        draw,
        MARGIN + 24,
        footer_y + 18,
        footer_text,
        FONT_FOOTER,
        MUTED,
        PAGE_WIDTH - (MARGIN * 2) - 48,
        spacing=5,
    )

    rgb = image.convert("RGB")
    rgb.save(PNG_PATH)
    rgb.save(PDF_PATH, "PDF", resolution=200.0)


if __name__ == "__main__":
    main()
