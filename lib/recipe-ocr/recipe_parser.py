"""
recipe_parser.py
================
Extract structured recipe metadata from OCR token lists (easyOCR detail=0).

Mirrors the architecture of receipt_parser.py but targets recipe images:
handwritten recipe cards, cookbook pages, magazine clippings, printed recipes.

Output schema aligns with the existing Supabase tables:
  - recipes (title, servings, prep_time, cook_time, instructions_list)
  - recipe_ingredients (display_name, quantity, units)
  - standardized_ingredients (canonical lookup via ingredient_match_queue)

Dependencies: stdlib only (re, difflib, fractions)
"""
from __future__ import annotations

import re
import difflib
from fractions import Fraction
from typing import Optional

# Optional dictionary correction. Imported defensively so the parser still
# works in environments where recipe_dictionary.py is not on the path.
try:
    from recipe_dictionary import correct_ingredient_name as _correct_ingredient_name
except ImportError:
    try:
        from .recipe_dictionary import correct_ingredient_name as _correct_ingredient_name  # type: ignore
    except (ImportError, ValueError):
        _correct_ingredient_name = None  # type: ignore

# ---------------------------------------------------------------------------
# Compiled regex constants
# ---------------------------------------------------------------------------

# ── Quantity patterns ──────────────────────────────────────────────────────

# Unicode fraction characters → decimal
_UNICODE_FRACTIONS: dict[str, float] = {
    "\u00BC": 0.25,   # ¼
    "\u00BD": 0.5,    # ½
    "\u00BE": 0.75,   # ¾
    "\u2150": 1/7,    # ⅐
    "\u2151": 1/9,    # ⅑
    "\u2152": 0.1,    # ⅒
    "\u2153": 1/3,    # ⅓
    "\u2154": 2/3,    # ⅔
    "\u2155": 0.2,    # ⅕
    "\u2156": 0.4,    # ⅖
    "\u2157": 0.6,    # ⅗
    "\u2158": 0.8,    # ⅘
    "\u2159": 1/6,    # ⅙
    "\u215A": 5/6,    # ⅚
    "\u215B": 0.125,  # ⅛
    "\u215C": 0.375,  # ⅜
    "\u215D": 0.625,  # ⅝
    "\u215E": 0.875,  # ⅞
}

# Matches: "1/2", "1 1/2", "2", "0.5", "1½", "2-3", "2 to 3"
_QTY_FRACTION_RE = re.compile(
    r"^(\d+)\s+(\d+)\s*/\s*(\d+)"       # "1 1/2" — whole + fraction
    r"|^(\d+)\s*/\s*(\d+)"              # "1/2"   — bare fraction
    r"|^(\d+(?:\.\d+)?)"                # "2" or "0.5" — whole or decimal
)

# Range pattern: "2-3", "2 to 3", "2–3"
_QTY_RANGE_RE = re.compile(
    r"^(\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?)"
)

# ── Unit patterns ──────────────────────────────────────────────────────────

# Ordered longest-first to prevent partial matches ("tablespoon" before "tbsp")
_UNIT_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\btablespoons?\b", re.I),    "tablespoon"),
    (re.compile(r"\bteaspoons?\b", re.I),      "teaspoon"),
    (re.compile(r"\btbsp\.?\b", re.I),         "tablespoon"),
    (re.compile(r"\btsp\.?\b", re.I),          "teaspoon"),
    (re.compile(r"\bfluid\s+ounces?\b", re.I), "fluid ounce"),
    (re.compile(r"\bfl\.?\s*oz\.?\b", re.I),   "fluid ounce"),
    (re.compile(r"\bcups?\b", re.I),           "cup"),
    (re.compile(r"\bounces?\b", re.I),         "ounce"),
    (re.compile(r"\boz\.?\b", re.I),           "ounce"),
    (re.compile(r"\bpounds?\b", re.I),         "pound"),
    (re.compile(r"\blbs?\.?\b", re.I),         "pound"),
    (re.compile(r"\bpints?\b", re.I),          "pint"),
    (re.compile(r"\bpt\.?\b", re.I),           "pint"),
    (re.compile(r"\bquarts?\b", re.I),         "quart"),
    (re.compile(r"\bqt\.?\b", re.I),           "quart"),
    (re.compile(r"\bgallons?\b", re.I),        "gallon"),
    (re.compile(r"\bgal\.?\b", re.I),          "gallon"),
    (re.compile(r"\bgrams?\b", re.I),          "gram"),
    (re.compile(r"\bg\b", re.I),               "gram"),
    (re.compile(r"\bkilograms?\b", re.I),      "kilogram"),
    (re.compile(r"\bkg\.?\b", re.I),           "kilogram"),
    (re.compile(r"\bmilliliters?\b", re.I),    "milliliter"),
    (re.compile(r"\bml\.?\b", re.I),           "milliliter"),
    (re.compile(r"\bliters?\b", re.I),         "liter"),
    (re.compile(r"\bl\b", re.I),               "liter"),
    (re.compile(r"\bcloves?\b", re.I),         "clove"),
    (re.compile(r"\bheads?\b", re.I),          "head"),
    (re.compile(r"\bbunche?s?\b", re.I),       "bunch"),
    (re.compile(r"\bstalks?\b", re.I),         "stalk"),
    (re.compile(r"\bsprigs?\b", re.I),         "sprig"),
    (re.compile(r"\bslices?\b", re.I),         "slice"),
    (re.compile(r"\bpieces?\b", re.I),         "piece"),
    (re.compile(r"\bpinch(?:es)?\b", re.I),    "pinch"),
    (re.compile(r"\bdash(?:es)?\b", re.I),     "dash"),
    (re.compile(r"\bcans?\b", re.I),           "can"),
    (re.compile(r"\bpackages?\b", re.I),       "package"),
    (re.compile(r"\bpkgs?\.?\b", re.I),        "package"),
    (re.compile(r"\bsticks?\b", re.I),         "stick"),
    (re.compile(r"\bdrops?\b", re.I),          "drop"),
    (re.compile(r"\bhandfuls?\b", re.I),       "handful"),
    (re.compile(r"\bbags?\b", re.I),           "bag"),
    (re.compile(r"\bboxe?s?\b", re.I),         "box"),
    (re.compile(r"\bjars?\b", re.I),           "jar"),
    (re.compile(r"\bbottles?\b", re.I),        "bottle"),
    (re.compile(r"\bmedium\b", re.I),          "medium"),
    (re.compile(r"\blarge\b", re.I),           "large"),
    (re.compile(r"\bsmall\b", re.I),           "small"),
]

# ── Section detection ──────────────────────────────────────────────────────

_SECTION_INGREDIENTS = re.compile(
    r"^(?:ingredients?|what\s+you(?:'ll)?\s+need|you(?:'ll)?\s+need|shopping\s+list)\s*:?\s*$",
    re.IGNORECASE,
)
_SECTION_INSTRUCTIONS = re.compile(
    r"^(?:instructions?|directions?|method|steps?|preparation|how\s+to\s+(?:make|cook|prepare)|procedure)\s*:?\s*$",
    re.IGNORECASE,
)
_SECTION_NOTES = re.compile(
    r"^(?:notes?|tips?|variations?|chef(?:'s)?\s+(?:notes?|tips?))\s*:?\s*$",
    re.IGNORECASE,
)

# ── Time patterns ──────────────────────────────────────────────────────────

_TIME_MINUTES_RE = re.compile(
    r"(\d+)\s*(?:min(?:ute)?s?|m\b)", re.IGNORECASE
)
_TIME_HOURS_RE = re.compile(
    r"(\d+)\s*(?:hours?|hrs?\.?|h\b)", re.IGNORECASE
)
_PREP_TIME_RE = re.compile(
    r"prep(?:\s+time)?\s*:?\s*(.+?)(?:\n|$|cook|total)", re.IGNORECASE
)
_COOK_TIME_RE = re.compile(
    r"cook(?:ing)?\s+time\s*:?\s*(.+?)(?:\n|$|prep|total)", re.IGNORECASE
)

# ── Serving size ───────────────────────────────────────────────────────────

_SERVINGS_RE = re.compile(
    r"(?:serves?|servings?|makes?|yields?|portions?)\s*:?\s*(\d+)",
    re.IGNORECASE,
)

# ── Instruction step numbering ─────────────────────────────────────────────

_STEP_NUMBER_RE = re.compile(r"^(?:step\s+)?(\d+)[\.\)\:]?\s*", re.IGNORECASE)

# ── Boilerplate / noise ───────────────────────────────────────────────────

_BOILERPLATE = re.compile(
    r"printed from|all rights reserved|copyright|©|"
    r"www\.|http|\.com\b|\.org\b|"
    r"page \d|advertisement|sponsored|"
    r"pinterest|facebook|twitter|instagram|"
    r"print recipe|save recipe|rate this|"
    r"jump to recipe|nutrition (?:facts|info)|per serving",
    re.IGNORECASE,
)

# ── OCR corrections ───────────────────────────────────────────────────────

_OCR_IN_WORD: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\|"),                          "I"),   # | → I
    (re.compile(r"(?<=[A-Za-z])0(?=[A-Za-z])"), "O"),   # w0rd → wOrd
    (re.compile(r"(?<=[A-Za-z])1(?=[A-Za-z])"), "l"),   # f1rst → flrst
    (re.compile(r"\$(?=[A-Za-z])"),              "S"),   # $alt → Salt
]

_OCR_IN_NUM: list[tuple[re.Pattern, str]] = [
    (re.compile(r"(?<!\d)[Oo](?=\d)"),  "0"),
    (re.compile(r"(?<=\d)[Oo](?!\d)"),  "0"),
    (re.compile(r"(?<!\d)[Il](?=\d)"),  "1"),
    (re.compile(r"(?<=\d)[Il](?!\d)"),  "1"),
    (re.compile(r"(?<!\d)[Ss](?=\d)"),  "5"),
    (re.compile(r"(?<=\d)[Ss](?!\d)"),  "5"),
]

_NUM_LIKE_RE = re.compile(r"^[\d.,/\s]+$")


# ---------------------------------------------------------------------------
# OCR token normalisation (mirrors receipt_parser._normalise_ocr_tokens)
# ---------------------------------------------------------------------------

def _normalise_ocr_tokens(tokens: list[str]) -> list[str]:
    """Apply OCR character-substitution corrections to every token.

    Strategy mirrors receipt_parser.py:
    - Numeric tokens → fix letters that resemble digits (O→0, l→1)
    - Text tokens → fix digits/symbols that resemble letters ($→S, |→I)
    - Universal: normalise smart-quotes, strip trailing noise.
    - Merge pass: join split fraction tokens ['1', '/', '2'] → ['1/2']
    """
    out: list[str] = []
    for tok in tokens:
        t = tok
        # Universal: normalise typographic quotes
        t = (t.replace("\u2018", "'").replace("\u2019", "'")
              .replace("\u201c", '"').replace("\u201d", '"')
              .replace("`", "'"))
        t = t.rstrip("!").strip("_").strip()
        t = re.sub(r"^['\"]+ ", "", t).strip()

        if not t:
            continue

        if _NUM_LIKE_RE.match(t):
            for pat, rep in _OCR_IN_NUM:
                t = pat.sub(rep, t)
        else:
            for pat, rep in _OCR_IN_WORD:
                t = pat.sub(rep, t)

        out.append(t)
    return _merge_split_fractions(out)


def _merge_split_fractions(tokens: list[str]) -> list[str]:
    """Merge OCR-split fraction tokens: ['1', '/', '2'] → ['1/2']."""
    out: list[str] = []
    i = 0
    while i < len(tokens):
        # Pattern: digit + '/' + digit
        if (i + 2 < len(tokens)
                and re.match(r"^\d+$", tokens[i])
                and tokens[i + 1] in ("/", "\\")
                and re.match(r"^\d+$", tokens[i + 2])):
            out.append(f"{tokens[i]}/{tokens[i + 2]}")
            i += 3
            continue
        # Pattern: 'N/' + 'M'
        if (i + 1 < len(tokens)
                and re.match(r"^\d+/$", tokens[i])
                and re.match(r"^\d+$", tokens[i + 1])):
            out.append(f"{tokens[i]}{tokens[i + 1]}")
            i += 2
            continue
        out.append(tokens[i])
        i += 1
    return out


# ---------------------------------------------------------------------------
# Quantity parsing
# ---------------------------------------------------------------------------

def parse_quantity(text: str) -> tuple[Optional[float], str]:
    """Parse a quantity expression from the start of a string.

    Returns (quantity_float, remaining_text).
    Handles: "1 1/2", "1/2", "½", "2", "0.5", "2-3" (takes average).
    """
    text = text.strip()

    # Replace Unicode fractions first
    for char, val in _UNICODE_FRACTIONS.items():
        if char in text:
            idx = text.index(char)
            before = text[:idx].strip()
            after = text[idx + 1:].strip()
            whole = float(before) if before and before.isdigit() else 0.0
            return whole + val, after

    # Try range first: "2-3 cups"
    m = _QTY_RANGE_RE.match(text)
    if m:
        low, high = float(m.group(1)), float(m.group(2))
        return (low + high) / 2, text[m.end():].strip()

    # Try standard fraction/decimal
    m = _QTY_FRACTION_RE.match(text)
    if m:
        if m.group(1) is not None:
            # "1 1/2" — whole + fraction
            whole = int(m.group(1))
            num, den = int(m.group(2)), int(m.group(3))
            if den == 0:
                return None, text
            return whole + num / den, text[m.end():].strip()
        elif m.group(4) is not None:
            # "1/2" — bare fraction
            num, den = int(m.group(4)), int(m.group(5))
            if den == 0:
                return None, text
            return num / den, text[m.end():].strip()
        elif m.group(6) is not None:
            # "2" or "0.5"
            return float(m.group(6)), text[m.end():].strip()

    return None, text


# ---------------------------------------------------------------------------
# Unit parsing
# ---------------------------------------------------------------------------

def parse_unit(text: str) -> tuple[Optional[str], str]:
    """Extract a measurement unit from the start of a string.

    Returns (canonical_unit, remaining_text).
    """
    text = text.strip()
    for pattern, canonical in _UNIT_PATTERNS:
        m = pattern.match(text)
        if m:
            return canonical, text[m.end():].strip()
    return None, text


# ---------------------------------------------------------------------------
# Ingredient line parsing
# ---------------------------------------------------------------------------

def parse_ingredient_line(line: str) -> dict | None:
    """Parse a single ingredient line into structured components.

    Examples:
        "1 1/2 cups all-purpose flour"    → {quantity: 1.5, unit: "cup", name: "all-purpose flour"}
        "3 large eggs"                     → {quantity: 3.0, unit: "large", name: "eggs"}
        "Salt and pepper to taste"         → {quantity: None, unit: None, name: "salt and pepper to taste"}
        "1 (14 oz) can diced tomatoes"     → {quantity: 1.0, unit: "can", name: "diced tomatoes"}

    Returns None if the line looks like noise / non-ingredient.
    """
    line = line.strip()
    if not line or len(line) < 2:
        return None
    if _BOILERPLATE.search(line):
        return None

    # Strip leading bullet/dash markers
    line = re.sub(r"^[\-\*\u2022\u25CF\u25CB\u2023\u25AA•·]\s*", "", line).strip()
    # Strip leading checkbox markers: [ ] or [x]
    line = re.sub(r"^\[.?\]\s*", "", line).strip()

    if not line:
        return None

    # Parse quantity
    qty, rest = parse_quantity(line)

    # Handle parenthetical size: "1 (14 oz) can" → skip the parens, keep parsing
    paren_match = re.match(r"\(([^)]+)\)\s*", rest)
    paren_note = None
    if paren_match:
        paren_note = paren_match.group(1).strip()
        rest = rest[paren_match.end():]

    # Parse unit
    unit, rest = parse_unit(rest)

    # If no unit was found but paren_note contains one, try parsing it
    if not unit and paren_note:
        paren_unit, paren_rest = parse_unit(paren_note)
        if paren_unit:
            unit = paren_unit

    # Clean up the ingredient name
    name = rest.strip()
    # Remove trailing comma or period
    name = re.sub(r"[.,;]+$", "", name).strip()
    # Remove leading "of " (e.g., "1 cup of flour" → "flour")
    name = re.sub(r"^of\s+", "", name, flags=re.IGNORECASE).strip()

    if not name:
        return None

    # Heuristic: if no quantity AND no unit, and the line is long (>50 chars),
    # it's almost certainly an instruction sentence, not an ingredient.
    if qty is None and unit is None and len(line) > 50:
        return None

    # Heuristic: if no quantity AND no unit AND the line contains cooking verbs
    # at the start, it's an instruction, not an ingredient.
    if qty is None and unit is None:
        _INSTRUCTION_VERBS = re.compile(
            r"^(?:heat|add|mix|pour|stir|cook|bake|preheat|combine|beat|"
            r"fold|whisk|serve|place|remove|bring|let|set|cover|drain|"
            r"transfer|arrange|spread|sprinkle|season|toss|roll|cut|"
            r"simmer|boil|reduce|saute|grill|broil|roast|fry)\b",
            re.IGNORECASE,
        )
        if _INSTRUCTION_VERBS.match(name):
            return None

    return {
        "quantity": qty,
        "unit": unit,
        "name": name,
        "display_name": line,  # preserve the original OCR text
    }


# ---------------------------------------------------------------------------
# Time parsing
# ---------------------------------------------------------------------------

def _parse_time_string(text: str) -> Optional[int]:
    """Parse a time string into total minutes."""
    total = 0
    h = _TIME_HOURS_RE.search(text)
    m = _TIME_MINUTES_RE.search(text)
    if h:
        total += int(h.group(1)) * 60
    if m:
        total += int(m.group(1))
    return total if total > 0 else None


# ---------------------------------------------------------------------------
# Section classification
# ---------------------------------------------------------------------------

class _Section:
    UNKNOWN = "unknown"
    TITLE = "title"
    INGREDIENTS = "ingredients"
    INSTRUCTIONS = "instructions"
    NOTES = "notes"
    META = "meta"  # servings, times, etc.


def _classify_line(line: str) -> str:
    """Classify a single line as a section header or content type."""
    stripped = line.strip()
    if not stripped:
        return _Section.UNKNOWN
    if _SECTION_INGREDIENTS.match(stripped):
        return _Section.INGREDIENTS
    if _SECTION_INSTRUCTIONS.match(stripped):
        return _Section.INSTRUCTIONS
    if _SECTION_NOTES.match(stripped):
        return _Section.NOTES
    if _SERVINGS_RE.search(stripped):
        return _Section.META
    if _PREP_TIME_RE.search(stripped) or _COOK_TIME_RE.search(stripped):
        return _Section.META
    return _Section.UNKNOWN


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------

def parse_recipe(tokens: list[str], apply_dict_correction: bool = True) -> dict:
    """Parse OCR tokens into a structured recipe.

    Parameters
    ----------
    tokens : list[str]
        Raw token list from easyOCR (detail=0) or equivalent OCR engine.
    apply_dict_correction : bool
        If True (default) and recipe_dictionary is importable, apply fuzzy
        cooking-dictionary correction to each parsed ingredient `name`.
        Callers that already apply correction externally can pass False.

    Returns
    -------
    dict
        {
            "title": str | None,
            "description": str | None,
            "servings": int | None,
            "prep_time": int | None,       # minutes
            "cook_time": int | None,       # minutes
            "ingredients": [
                {"quantity": float|None, "unit": str|None, "name": str, "display_name": str}
            ],
            "instructions": [
                {"step": int, "description": str}
            ],
            "notes": [str],
            "confidence": float,           # 0.0–1.0 parse confidence
        }
    """
    # Normalise tokens
    tokens = _normalise_ocr_tokens(tokens)

    # Join tokens into lines for structural analysis.
    # OCR engines typically emit one token per text region / line.
    lines = tokens

    # ── Extract metadata from full text ────────────────────────────────────
    full_text = "\n".join(lines)

    servings = None
    m = _SERVINGS_RE.search(full_text)
    if m:
        servings = int(m.group(1))

    prep_time = None
    m = _PREP_TIME_RE.search(full_text)
    if m:
        prep_time = _parse_time_string(m.group(1))

    cook_time = None
    m = _COOK_TIME_RE.search(full_text)
    if m:
        cook_time = _parse_time_string(m.group(1))

    # ── Section segmentation ───────────────────────────────────────────────
    # Walk through lines, detecting section headers and assigning lines to
    # the appropriate section. This mirrors how receipt_parser uses
    # store-specific handlers — here we use section-based dispatching.

    current_section = _Section.TITLE
    title_lines: list[str] = []
    ingredient_lines: list[str] = []
    instruction_lines: list[str] = []
    note_lines: list[str] = []
    meta_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if _BOILERPLATE.search(stripped):
            continue

        # Check if this line is a section header
        classification = _classify_line(stripped)

        if classification == _Section.INGREDIENTS:
            current_section = _Section.INGREDIENTS
            continue  # skip the header itself
        elif classification == _Section.INSTRUCTIONS:
            current_section = _Section.INSTRUCTIONS
            continue
        elif classification == _Section.NOTES:
            current_section = _Section.NOTES
            continue
        elif classification == _Section.META:
            meta_lines.append(stripped)
            continue

        # Heuristic: if we're in title and see what looks like an ingredient
        # line (starts with a number + unit), switch to ingredients.
        # This must be checked BEFORE the numbered-step heuristic so that
        # "2 cups flour" is not mistaken for instruction step 2.
        if current_section == _Section.TITLE:
            qty_test, rest_test = parse_quantity(stripped)
            if qty_test is not None:
                unit_test, _ = parse_unit(rest_test)
                if unit_test is not None:
                    current_section = _Section.INGREDIENTS

        # Heuristic section detection: if we see a numbered step while in
        # a NON-ingredient section, switch to instructions.
        # Only trigger when the line looks like a prose sentence (>30 chars)
        # and does NOT parse as an ingredient (has no unit after the number).
        if current_section in (_Section.UNKNOWN, _Section.TITLE):
            if _STEP_NUMBER_RE.match(stripped) and len(stripped) > 30:
                current_section = _Section.INSTRUCTIONS

        # If we're in ingredients and see a long line starting with a step
        # number that does NOT parse as an ingredient, switch to instructions.
        if current_section == _Section.INGREDIENTS:
            if _STEP_NUMBER_RE.match(stripped) and len(stripped) > 30:
                test_ing = parse_ingredient_line(stripped)
                if test_ing is None or (test_ing["unit"] is None and len(stripped) > 40):
                    current_section = _Section.INSTRUCTIONS

        # Auto-detect instruction boundary when in ingredients section:
        # if a line doesn't parse as an ingredient and is a long prose
        # sentence (likely an instruction), switch to instructions.
        if current_section == _Section.INGREDIENTS:
            test_ing = parse_ingredient_line(stripped)
            if test_ing is None and len(stripped) > 25:
                current_section = _Section.INSTRUCTIONS

        # Assign line to current section
        if current_section == _Section.TITLE:
            title_lines.append(stripped)
        elif current_section == _Section.INGREDIENTS:
            ingredient_lines.append(stripped)
        elif current_section == _Section.INSTRUCTIONS:
            instruction_lines.append(stripped)
        elif current_section == _Section.NOTES:
            note_lines.append(stripped)

    # ── Parse title ────────────────────────────────────────────────────────
    # Title is typically the first 1-2 non-empty lines before any section
    title = None
    if title_lines:
        # Take the first substantial line as the title
        for tl in title_lines:
            if len(tl) > 3 and not _BOILERPLATE.search(tl):
                title = tl
                break

    # ── Parse ingredients ──────────────────────────────────────────────────
    ingredients: list[dict] = []
    for line in ingredient_lines:
        parsed = parse_ingredient_line(line)
        if parsed:
            ingredients.append(parsed)

    # Dictionary-based name correction (fuzzy match against cooking vocab).
    # display_name is intentionally preserved so callers can show the raw OCR.
    if apply_dict_correction and _correct_ingredient_name is not None:
        for ing in ingredients:
            ing["name"] = _correct_ingredient_name(ing["name"])

    # ── Parse instructions ─────────────────────────────────────────────────
    instructions: list[dict] = []
    step_num = 1
    for line in instruction_lines:
        stripped = line.strip()
        if not stripped or len(stripped) < 5:
            continue

        # Remove step number prefix if present
        m = _STEP_NUMBER_RE.match(stripped)
        if m:
            step_num = int(m.group(1))
            stripped = stripped[m.end():].strip()

        if stripped:
            instructions.append({
                "step": step_num,
                "description": stripped,
            })
            step_num += 1

    # ── Confidence scoring ─────────────────────────────────────────────────
    # Mirrors receipt_parser's checksum validation — but for recipes we check
    # structural completeness instead of price math.
    confidence = _compute_confidence(
        title=title,
        ingredients=ingredients,
        instructions=instructions,
        servings=servings,
    )

    return {
        "title": title,
        "description": None,  # description is rarely on recipe cards
        "servings": servings,
        "prep_time": prep_time,
        "cook_time": cook_time,
        "ingredients": ingredients,
        "instructions": instructions,
        "notes": note_lines,
        "confidence": confidence,
    }


def _compute_confidence(
    title: str | None,
    ingredients: list[dict],
    instructions: list[dict],
    servings: int | None,
) -> float:
    """Score parse completeness from 0.0 to 1.0.

    Weighting (mirrors receipt_parser's checksum approach):
    - Has title:              0.15
    - Has ≥2 ingredients:     0.30
    - Has ≥1 instruction:     0.25
    - Ingredients have qty:   0.15
    - Has servings:           0.05
    - Has ≥3 instructions:    0.10
    """
    score = 0.0

    if title and len(title) > 2:
        score += 0.15

    if len(ingredients) >= 2:
        score += 0.30
    elif len(ingredients) == 1:
        score += 0.15

    if len(instructions) >= 1:
        score += 0.25

    # Proportion of ingredients with parsed quantities
    if ingredients:
        qty_ratio = sum(1 for i in ingredients if i["quantity"] is not None) / len(ingredients)
        score += 0.15 * qty_ratio

    if servings is not None:
        score += 0.05

    if len(instructions) >= 3:
        score += 0.10

    return round(min(score, 1.0), 2)


# ---------------------------------------------------------------------------
# Escalation check (mirrors model_recommender.should_escalate)
# ---------------------------------------------------------------------------

def should_escalate(result: dict) -> bool:
    """Check if the parse result is suspicious and should be re-OCR'd.

    Mirrors receipt_parser's escalation logic:
    - Receipt: too few items, no total, no store, checksum mismatch
    - Recipe: too few ingredients, no title, no instructions, low confidence
    """
    if result["confidence"] < 0.4:
        return True
    if len(result["ingredients"]) < 2:
        return True
    if not result["title"]:
        return True
    if len(result["instructions"]) == 0:
        return True
    return False


# ---------------------------------------------------------------------------
# Convenience: parse from raw text (not tokens)
# ---------------------------------------------------------------------------

def parse_recipe_text(text: str) -> dict:
    """Parse a recipe from raw text (e.g., from Tesseract full-page OCR).

    Splits text into lines and delegates to parse_recipe().
    """
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    return parse_recipe(lines)
