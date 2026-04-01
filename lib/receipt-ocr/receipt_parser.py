"""
receipt_parser.py

Extract structured item metadata from easyOCR (detail=0) token lists.
Supports: Walmart, Harrods, SPAR, Whole Foods, Costco, WinCo Foods,
          Aldi, Kroger, Safeway, Meijer, Target, Trader Joe's,
          99 Ranch, Andronico's.
Falls back to a generic price-anchoring extractor for unknown stores.

Dependencies: stdlib only (re, datetime)
"""
from __future__ import annotations

import re
import difflib

# ---------------------------------------------------------------------------
# Compiled regex constants
# ---------------------------------------------------------------------------

_PRICE_RE = re.compile(
    r'^[£$€fFeE]*'              # optional currency / OCR'd £ prefix
    r'(\d{1,6})'                # integer part (1–6 digits — excludes barcodes)
    r'[\s]*[.,]{1,2}[\s]*'      # decimal separator (possibly spaced or doubled)
    r'(\d{1,3})'                # fractional part
    r'(?:\s*[A-Za-z/]+)?$',     # optional trailing flag (A, E, FS, R, kg …)
)

_BARCODE_STANDALONE = re.compile(r'^\d{10,15}(?:\s*[A-Za-z])?$')  # optional trailing tax flag
_BARCODE_TRAILING   = re.compile(r'\s\d{10,15}(?:\s*[A-Za-z])?$')  # optional trailing tax flag

_KW_SUBTOTAL = re.compile(r'\bsubt[o0q]', re.IGNORECASE)  # q catches SUBTQT OCR variant
_KW_TOTAL    = re.compile(r'\btot[a4][l1]?\b', re.IGNORECASE)
_KW_TAX      = re.compile(r'\bt[a4][x%]', re.IGNORECASE)
_KW_TENDER   = re.compile(r'\btend\b|\btendered\b', re.IGNORECASE)
_KW_CHANGE   = re.compile(r'\bchange\b', re.IGNORECASE)

_BOILERPLATE = re.compile(
    r'save money|live better|low prices|you can trust|'
    r'items s[ou]ld|change due|thank you|please|'
    r'store receipts|every day|pay from primary|eft debit|'
    r'appr code|terminal|network id|total purchase|'
    r'debit tend|cash tend|visa tend|'
    r'check.{0,3}member|come again|receipt for|back of receipt|'
    r'low price|harrods rewards|open sunday',
    re.IGNORECASE,
)

_QTY_PREFIX   = re.compile(r'^(\d{1,2})\s+(.+)$')
_SPAR_SIZE_RE = re.compile(
    r'^\d{0,4}(GR|KG|ML|LT?|G|OZ|LB|SML|TUB|PKT|CT)$',
    re.IGNORECASE,
)
# Common OCR digit-substitution map for normalising size tokens before matching.
_SIZE_DIGIT_TR = str.maketrans('OoSslIi', '0055111')
_DATE_SLASH   = re.compile(r'^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})')
_DATE_COMMA   = re.compile(r'^(\d{1,2})[,](\d{1,2})[,](\d{2,4})')

_STORE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\bwal[\s\-]?mart\b|\bwalmar[t]?\b|\bvalnart\b|\bwalamart\b', re.IGNORECASE), 'Walmart'),
    (re.compile(r'\bharrods\b', re.IGNORECASE), 'Harrods'),
    (re.compile(r'\bspar\b', re.IGNORECASE), 'SPAR'),
    (re.compile(r'\bwinco\b', re.IGNORECASE), 'WinCo Foods'),
    (re.compile(r'\bthornton\b', re.IGNORECASE), 'Costco/Thornton'),
    (re.compile(r'\bcostco\b', re.IGNORECASE), 'Costco'),
    # New US stores
    (re.compile(r'\baldi\b', re.IGNORECASE),            'Aldi'),
    (re.compile(r'\bkroger\b', re.IGNORECASE),          'Kroger'),
    (re.compile(r'\bsafeway\b', re.IGNORECASE),         'Safeway'),
    (re.compile(r'\bmeijer\b', re.IGNORECASE),          'Meijer'),
    (re.compile(r'\btarget\b', re.IGNORECASE),          'Target'),
    (re.compile(r'\btrader\s*joe', re.IGNORECASE),      "Trader Joe's"),
    (re.compile(r'\b99\s*ranch\b', re.IGNORECASE),      '99 Ranch'),
    (re.compile(r'\bandronico', re.IGNORECASE),         "Andronico's"),
]
_WHOLE_RE = re.compile(r'\bwhole\b', re.IGNORECASE)
_FOODS_RE = re.compile(r'\bfoods?\b', re.IGNORECASE)

# Canonical uppercase forms used for fuzzy fallback matching.
# Only invoked when all regex patterns have already failed.
_FUZZY_STORE_MAP: list[tuple[str, str]] = [
    ('WALMART',      'Walmart'),
    ('WAL MART',     'Walmart'),
    ('WHOLE FOODS',  'Whole Foods'),
    ("TRADER JOE'S", "Trader Joe's"),
    ('TRADER JOES',  "Trader Joe's"),
    ('TRADER JOE',   "Trader Joe's"),
    ('COSTCO',       'Costco'),
    ('KROGER',       'Kroger'),
    ('SAFEWAY',      'Safeway'),
    ('TARGET',       'Target'),
    ('ALDI',         'Aldi'),
    ('SPAR',         'SPAR'),
    ('HARRODS',      'Harrods'),
    ('WINCO FOODS',  'WinCo Foods'),
    ('WINCO',        'WinCo Foods'),
    ('MEIJER',       'Meijer'),
    ('99 RANCH',     '99 Ranch'),
    ('ANDRONICO',    "Andronico's"),
]
# Minimum SequenceMatcher ratio to accept a fuzzy match.
_FUZZY_THRESHOLD = 0.76


def _fuzzy_detect_store(header_tokens: list[str]) -> str | None:
    """Token-level fuzzy match against canonical store names.

    Handles 1–2 character OCR substitution errors (e.g. WALAMART → WALMART).
    Called only after all regex patterns have already failed.
    """
    for tok in header_tokens:
        t = normalise_token(tok).upper()
        if len(t) < 3:
            continue
        best_ratio = 0.0
        best_name: str | None = None
        for canonical, store_name in _FUZZY_STORE_MAP:
            ratio = difflib.SequenceMatcher(None, t, canonical).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_name = store_name
        if best_ratio >= _FUZZY_THRESHOLD:
            return best_name
    return None

_COSTCO_ITEM_RE = re.compile(r'^(\d{5,6})\s+(.+)$')
_COSTCO_QTY_RE  = re.compile(r'^(\d+)\s*@\s*(\d+[.,]\d{2})$')
_PLU_ITEM_RE    = re.compile(r'^\d{4,6}$')  # Whole Foods PLU codes
_SINGLE_FLAG    = re.compile(r'^[A-Za-z]$')
_ST_LINE_RE     = re.compile(r'\bST[#t]?\s*\d+|\bOP[#e]?\s*\d+|\bTE[#H]?\s*\d+', re.IGNORECASE)
# Trader Joe's category prefixes: R- (regular), T- (taxable), A- (produce)
_TJ_PREFIX_RE   = re.compile(r'^[RTA]-\s*', re.IGNORECASE)
# Unit/quantity descriptors that should not be treated as item names
_UNIT_DESCRIPTOR = re.compile(r'^(?:ea|each|lb|kg|oz|ct|pk|pt|qt|gal)$', re.IGNORECASE)

# ---- Additional US store brands ----
_DEPT_HEADER = re.compile(
    r'^(?:GROCERY|PRODUCE|DAIRY|DELI|BAKERY|MEAT|SEAFOOD|FROZEN|PHARMACY|'
    r'BEVERAGES?|HOUSEHOLD|HEALTH(?:\s+&?\s+BEAUTY)?|BEAUTY|COSMETICS|'
    r'ELECTRONICS|PAPER\s+PRODUCTS|CLEANING|HBA|HOME\s+GOODS|'
    r'PET\s+(?:CARE|FOOD)?|SNACKS|FROZEN\s+FOODS|PERSONAL\s+CARE|BABY|'
    r'GENERAL\s+MERCHANDISE|FLORAL|WINE\s*&?\s*SPIRITS?|BEER|LIQUOR)$',
    re.IGNORECASE,
)
_SAVINGS_LINE = re.compile(
    r'\bfor\s+[uU]\b|\bclub\s+card\b|\bcard\s+(?:price|savings)\b|'
    r'\bmperks?\b|\btarget\s+circle\b|\bcartwheel\b|'
    r'\bdigital\s+coupon\b|\bmfr\s+coupon\b|\byou\s+saved\b|'
    r'\bregular\s+price\b|\bsale\s+price\b|'
    r'\bkroger\s+(?:plus\s+)?savings\b|\bgas\s+points?\b|\bfuel\s+points?\b|'
    r'\bpoints?\s+(?:earned|balance)\b|\breward\s+(?:pts|balance)\b|'
    r'\btotal\s+savings\b|\btotal\s+coupons?\b|\bcoupon\s+savings\b|'
    r'\bredcard\b|\btarget\s+circle\s+card\b|\bjust\s+for\s+[uU]\b',
    re.IGNORECASE,
)
_WEIGHT_LINE    = re.compile(r'^\d+[.,]\d+\s*(lb|kg)\s*@', re.IGNORECASE)
_QTY_AT_LINE    = re.compile(r'^\d+\s*@\s*\$?\d+[.,]\d', re.IGNORECASE)
_TARGET_DPCI    = re.compile(r'^\d{9}\s+')
_TARGET_TAX_RE  = re.compile(r'\bT\s*=\s*\w[\w\s]*[Tt]ax\b', re.IGNORECASE)
_CHINESE_LINE   = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]')
_DISCOUNT_LINE  = re.compile(r'^-\s*\d+[.,]\d')
_KW_TOTAL_OR_BALANCE = re.compile(r'\btot[a4][l1]?\b|\bbalance\b', re.IGNORECASE)

# ---------------------------------------------------------------------------
# OCR token pre-correction
# ---------------------------------------------------------------------------

# Substitutions applied to tokens that look like ordinary text (item names, store names).
# Fixes digits/symbols that the OCR engine commonly mistakes for letters.
_OCR_IN_WORD: list[tuple[re.Pattern, str]] = [
    (re.compile(r'(?<=[A-Za-z])\$'),            'S'),   # JOE'$ → JOE'S
    (re.compile(r'\|'),                          'I'),   # | → I
    (re.compile(r'(?<=[A-Za-z])0(?=[A-Za-z])'), 'O'),   # w0rd → wOrd
    (re.compile(r'(?<=[A-Za-z])1(?=[A-Za-z])'), 'I'),   # f1rst → fIrst
]

# Substitutions applied to tokens that look like prices / numeric codes.
# Fixes letters that the OCR engine commonly mistakes for digits.
_OCR_IN_NUM: list[tuple[re.Pattern, str]] = [
    (re.compile(r'(?<!\d)[Oo](?=\d)'),  '0'),   # O before digit → 0
    (re.compile(r'(?<=\d)[Oo](?!\d)'),  '0'),   # O after digit  → 0
    (re.compile(r'(?<!\d)[Il](?=\d)'),  '1'),   # I/l before digit → 1
    (re.compile(r'(?<=\d)[Il](?!\d)'),  '1'),   # I/l after digit  → 1
    (re.compile(r'(?<!\d)[Ss](?=\d)'),  '5'),   # S before digit → 5
    (re.compile(r'(?<=\d)[Ss](?!\d)'),  '5'),   # S after digit  → 5
]

# A token is "price-like" when its non-whitespace characters are mostly digits
# and price-punctuation.  The definition is intentionally broad so that tokens
# such as "0.41", "33,99 A", "$1.29 F", "6.74 X" all qualify.
_PRICE_LIKE_RE = re.compile(r'^[£$€fFeE\s]*[\d.,]+(?:\s*[A-Za-z/]{0,3})?$')


def _normalise_ocr_tokens(tokens: list[str]) -> list[str]:
    """Apply systematic OCR character-substitution corrections to every token.

    Two-pass strategy:
    • Price-like tokens  → fix letters that resemble digits  (O→0, l→1, S→5)
    • Text-like tokens   → fix digits/symbols that resemble letters ($→S, |→I)
    Universal: normalise smart-quotes/backticks and strip trailing noise chars.
    After per-token corrections, a merge pass joins split price tokens such as
    ['4.', '88'] → ['4.88'] which arise when EasyOCR breaks a price mid-decimal.
    """
    out: list[str] = []
    for tok in tokens:
        t = tok
        # Universal: normalise typographic quotes and strip trailing garbage chars
        t = (t.replace('\u2018', "'").replace('\u2019', "'")
              .replace('\u201c', '"').replace('\u201d', '"')
              .replace('`', "'"))
        t = t.rstrip('!').strip('_').strip()
        # Strip stray leading quote/apostrophe that EasyOCR sometimes prepends
        # to barcodes and price tokens (e.g. "'471288396027" → "471288396027",
        # "'2.48 N" → "2.48 N").
        t = re.sub(r'^[\'\"]+', '', t).strip()
        # Strip leading dot before a price (OCR artifact: ".23.19" → "23.19")
        # But preserve ".44" pattern — it's a split price fragment that the
        # merge pass below will combine with the preceding "46" → "46.44".
        if re.match(r'^\.\d+\.\d', t):  # ".23.19" has two decimals → artifact
            t = re.sub(r'^\.', '', t)

        # Bug fix: skip tokens that are empty after normalisation so they don't
        # cause downstream regex and index errors.
        if not t:
            continue

        if _PRICE_LIKE_RE.match(t):
            for pat, rep in _OCR_IN_NUM:
                t = pat.sub(rep, t)
        else:
            for pat, rep in _OCR_IN_WORD:
                t = pat.sub(rep, t)

        out.append(t)
    return _merge_split_prices(out)


# Matches a token that is an integer followed by a decimal point with no
# fractional digits — the cents portion was split into the next token.
_SPLIT_PRICE_LEFT  = re.compile(r'^([£$€]?\d{1,6})\.$')
_SPLIT_PRICE_RIGHT = re.compile(r'^(\d{1,3})([A-Za-z/]*)$')


def _merge_split_prices(tokens: list[str]) -> list[str]:
    """Merge adjacent tokens that together form a valid price.

    Handles two OCR split patterns:
    • ['4.', '88']       → ['4.88']     (decimal point at end of first token)
    • ['21 ,', '74']     → ['21.74']    (space around separator)
    • ['46', '.44']      → ['46.44']    (decimal point at start of second token)
    """
    _SPLIT_WITH_SPACE = re.compile(r'^(\d{1,6})\s*[,.]$')
    _DOT_THEN_DIGITS  = re.compile(r'^[.,](\d{1,3})([A-Za-z/]*)$')

    out: list[str] = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        merged = False

        if i + 1 < len(tokens):
            nxt = tokens[i + 1]

            # Pattern 1: 'N.' + 'dd[flag]'  →  'N.dd[flag]'
            m_left  = _SPLIT_PRICE_LEFT.match(t)
            m_right = _SPLIT_PRICE_RIGHT.match(nxt)
            if m_left and m_right:
                out.append(f"{m_left.group(1)}.{m_right.group(1)}{m_right.group(2)}")
                i += 2
                merged = True

            # Pattern 2: 'N ,' + 'dd'  →  'N.dd'
            elif _SPLIT_WITH_SPACE.match(t) and re.match(r'^\d{1,3}$', nxt):
                n = _SPLIT_WITH_SPACE.match(t).group(1)
                out.append(f"{n}.{nxt}")
                i += 2
                merged = True

            # Pattern 3: 'N' + '.dd[flag]'  →  'N.dd[flag]'
            elif re.match(r'^\d{1,6}$', t) and _DOT_THEN_DIGITS.match(nxt):
                m = _DOT_THEN_DIGITS.match(nxt)
                out.append(f"{t}.{m.group(1)}{m.group(2)}")
                i += 2
                merged = True

        if not merged:
            out.append(t)
            i += 1
    return out


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def normalise_token(token: str) -> str:
    t = re.sub(r'\s+', ' ', token).strip()
    # Strip trailing punctuation that bleeds in from adjacent receipt columns
    t = re.sub(r'[.,;:\-]+$', '', t).strip()
    return t


def parse_price(token: str) -> float | None:
    t = normalise_token(token)
    m = _PRICE_RE.match(t)
    if not m:
        return None
    return float(f"{m.group(1)}.{m.group(2)}")


def is_barcode(token: str) -> bool:
    return bool(_BARCODE_STANDALONE.match(normalise_token(token)))


def is_noise_token(token: str) -> bool:
    t = normalise_token(token)
    if len(t) <= 1:
        return True
    if _BOILERPLATE.search(t):
        return True
    alnum = sum(1 for c in t if c.isalnum())
    if alnum == 0:
        return True
    if len(t) > 4 and alnum / len(t) < 0.4:
        return True
    # OCR garbage signature: mixed upper+lower case combined with underscore or
    # trailing exclamation mark — a reliable indicator of corrupted recognition.
    if (len(t) > 5
            and ('_' in t or t.endswith('!'))
            and re.search(r'[a-z]', t)
            and re.search(r'[A-Z]', t)):
        return True
    # A long all-alpha token with no vowels is almost certainly an OCR artefact
    # (barcode fragment, decorative line mis-read as text, etc.).
    if len(t) > 8 and t.isalpha() and not re.search(r'[AEIOUaeiou]', t):
        return True
    return False


# Maximum days per month (ignoring leap years for simplicity — day 29 in Feb
# is accepted because we cannot know the year at regex-match time).
_DAYS_IN_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def parse_date(token: str, day_first: bool = False) -> str | None:
    parts = normalise_token(token).split()
    if not parts:
        return None
    t = parts[0]  # drop time portion
    for pat in (_DATE_SLASH, _DATE_COMMA):
        m = pat.match(t)
        if not m:
            continue
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000 if y <= 30 else 1900
        if day_first:
            day, month = a, b
        elif a > 12:
            day, month = a, b
        elif b > 12:
            month, day = a, b
        else:
            month, day = a, b  # default: US order (month first)
        # Bug fix: validate day against the actual maximum for that month, not
        # just the universal upper bound of 31 (which accepted Feb 31 etc.).
        if 1 <= month <= 12 and 1 <= day <= _DAYS_IN_MONTH[month]:
            return f"{y:04d}-{month:02d}-{day:02d}"
    return None


def extract_quantity_prefix(name: str) -> tuple[int, str]:
    m = _QTY_PREFIX.match(name.strip())
    if m:
        qty = int(m.group(1))
        if qty <= 99:
            return qty, m.group(2).strip()
    return 1, name.strip()


def _empty_result(store: str) -> dict:
    return {
        "store": store,
        "date": None,
        "items": [],
        "subtotal": None,
        "taxes": [],
        "total": None,
    }


def _is_size_token(token: str) -> bool:
    t = normalise_token(token).upper()
    if len(t) > 8:
        return False
    units = ('GR', 'KG', 'ML', 'LTR', 'LT', 'OZ', 'LB', 'SML', 'TUB', 'PKT', 'CT', 'G', 'L')
    if any(t.endswith(u) for u in units):
        return True
    # Retry with OCR digit-letter confusions normalised (O→0, S→5, l/I→1).
    # Catches tokens like '8OGR' (80GR), 'Soogr' (500GR), '27OGR' (270GR).
    t2 = t.translate(_SIZE_DIGIT_TR)
    return t2 != t and any(t2.endswith(u) for u in units)


_DATE_EMBEDDED = re.compile(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})')


_POLICY_CONTEXT = re.compile(
    r'\breturn(?:s|ed)?\s+(?:on|with|will|policy)\b|\bpolicy\b|\bcondition|\bpurchased?\s+after\b|\bafter\s+\d{1,2}[/\-]',
    re.IGNORECASE,
)


def _find_date_in_tokens(tokens: list[str], day_first: bool = False) -> str | None:
    """Return the first date found scanning the token list.

    First pass: standard parse_date on each token (anchored match).
    Second pass: search for a date pattern embedded within a longer token,
    e.g. '908 638702/10/2021' where OCR fused a store code with the date.

    Skips dates that appear inside returns/policy text (e.g. "after 9/15/2020")
    to avoid picking up policy effective dates as the receipt date.
    """
    for i, t in enumerate(tokens):
        # Skip dates in policy/return context
        if _POLICY_CONTEXT.search(t):
            continue
        # Also check surrounding tokens for policy context
        context = ' '.join(tokens[max(0, i - 2):i])
        if _POLICY_CONTEXT.search(context):
            continue
        d = parse_date(t, day_first=day_first)
        if d:
            return d
    # Embedded date fallback — scan in reverse to prefer dates near the bottom
    for i, t in enumerate(reversed(tokens)):
        orig_idx = len(tokens) - 1 - i
        # Skip dates in tokens that themselves contain policy language
        if _POLICY_CONTEXT.search(t):
            continue
        # Try all date matches in the token (rightmost first via findall)
        for m in reversed(list(_DATE_EMBEDDED.finditer(t))):
            d = parse_date(f"{m.group(1)}/{m.group(2)}/{m.group(3)}", day_first=day_first)
            if d:
                return d
    return None


def _fill_totals(result: dict, tokens: list[str], subtotal_idx: int,
                 use_balance: bool = False) -> None:
    """Populate subtotal, taxes, and total in *result* from *tokens*.

    *subtotal_idx* is the index of the SUBTOTAL keyword token (or len(tokens)
    if absent).  When *use_balance* is True the total is found via the BALANCE
    keyword instead of TOTAL (used by Kroger).
    """
    # Subtotal value: look in tokens immediately after SUBTOTAL keyword
    if subtotal_idx < len(tokens):
        for t in tokens[subtotal_idx + 1: subtotal_idx + 9]:
            p = parse_price(normalise_token(t))
            if p is not None:
                result["subtotal"] = p
                break

    # Tax lines — track which token indices have already produced a tax entry
    # so that overlapping scan windows don't create duplicate tax rows.
    # Bug fix: the original code could append the same tax amount multiple times
    # when adjacent tax-keyword tokens were close together.
    seen_tax_token_idxs: set[int] = set()
    for i, t in enumerate(tokens):
        n = normalise_token(t)
        if (_KW_TAX.search(n)
                and not _KW_TOTAL.search(n)
                and not _KW_SUBTOTAL.search(n)):
            for j, tt in enumerate(tokens[i + 1: i + 5], start=i + 1):
                p = parse_price(normalise_token(tt))
                if p is not None:
                    if j not in seen_tax_token_idxs:
                        result["taxes"].append({"rate": 0.0, "amount": p})
                        seen_tax_token_idxs.add(j)
                    break

    # Total — look forward up to 8 tokens, then backward up to 3 tokens.
    # Some Walmart/EFT receipts print the value on the line *before* the keyword.
    total_kw = _KW_TOTAL_OR_BALANCE if use_balance else _KW_TOTAL
    for i, t in enumerate(tokens):
        n = normalise_token(t)
        if (total_kw.search(n)
                and not _KW_SUBTOTAL.search(n)
                and not _KW_TAX.search(n)):
            for tt in tokens[i + 1: i + 9]:
                p = parse_price(normalise_token(tt))
                if p is not None:
                    result["total"] = p
                    break
            if result["total"] is None:
                for tt in reversed(tokens[max(0, i - 3): i]):
                    p = parse_price(normalise_token(tt))
                    if p is not None:
                        result["total"] = p
                        break
            if result["total"] is not None:
                break


# ---------------------------------------------------------------------------
# Store detection
# ---------------------------------------------------------------------------

def detect_store(tokens: list[str]) -> str | None:
    header = tokens[:25]
    header_str = ' '.join(normalise_token(t) for t in header)

    # Whole Foods: both words must appear within 5 token positions of each other.
    # Bug fix: also handle the common case where "Whole Foods" appears as a
    # single fused token (OCR joins two adjacent words). The original guard
    # `i != whole_idx` on foods_idx wrongly excluded the same-token case.
    whole_idx = next((i for i, t in enumerate(header) if _WHOLE_RE.search(t)), -1)
    foods_idx = next(
        (i for i, t in enumerate(header)
         if _FOODS_RE.search(t) and not (_WHOLE_RE.search(t) and i == whole_idx)), -1
    )
    # Same-token case: "Whole Foods" in one OCR token
    same_token_wf = next(
        (i for i, t in enumerate(header)
         if _WHOLE_RE.search(t) and _FOODS_RE.search(t)), -1
    )
    if same_token_wf != -1:
        return 'Whole Foods'
    if whole_idx != -1 and foods_idx != -1 and abs(whole_idx - foods_idx) <= 5:
        return 'Whole Foods'

    for pattern, name in _STORE_PATTERNS:
        if pattern.search(header_str):
            return name

    # Fallback: scan full token list
    full_str = ' '.join(normalise_token(t) for t in tokens)
    if _WHOLE_RE.search(full_str) and _FOODS_RE.search(full_str):
        return 'Whole Foods'
    for pattern, name in _STORE_PATTERNS:
        if pattern.search(full_str):
            return name

    # Last resort: fuzzy token-level match against canonical store names.
    # Handles 1–2 character OCR errors that defeat all regex patterns.
    return _fuzzy_detect_store(tokens[:25])


# ---------------------------------------------------------------------------
# Walmart parser
# ---------------------------------------------------------------------------

def extract_walmart(tokens: list[str]) -> dict:
    result = _empty_result("Walmart")

    # --- Locate header / item / subtotal boundaries ---
    header_end = 0
    for i, t in enumerate(tokens[:30]):
        if _ST_LINE_RE.search(t):
            header_end = i + 1
            break
    if header_end == 0:
        # Fallback: find the first token after the store name that looks like
        # an item (has letters and is followed within 3 tokens by a price or barcode).
        for i in range(min(6, len(tokens)), min(25, len(tokens))):
            n = normalise_token(tokens[i])
            if (re.search(r'[A-Za-z]{2,}', n) and not is_noise_token(n)
                    and not is_barcode(n)):
                # Check if a price or barcode follows within 3 tokens
                for j in range(i + 1, min(i + 4, len(tokens))):
                    nj = normalise_token(tokens[j])
                    if parse_price(nj) is not None or is_barcode(nj):
                        header_end = i
                        break
                if header_end > 0:
                    break
        if header_end == 0:
            header_end = min(10, len(tokens))

    subtotal_idx = len(tokens)
    for i, t in enumerate(tokens):
        if _KW_SUBTOTAL.search(normalise_token(t)):
            subtotal_idx = i
            break

    # --- Extract items ---
    pending_name: str | None = None
    items: list[dict] = []

    for t in tokens[header_end:subtotal_idx]:
        n = normalise_token(t)

        if is_noise_token(n):
            continue
        if _SINGLE_FLAG.match(n):
            continue
        # Skip section keywords that ended up inside the item region
        if _KW_SUBTOTAL.search(n) or _KW_TOTAL.search(n) or _KW_TAX.search(n):
            continue
        if _UNIT_DESCRIPTOR.match(n):
            continue

        # Name+barcode fused: strip trailing barcode
        if _BARCODE_TRAILING.search(n):
            name_part = _BARCODE_TRAILING.sub('', n).strip()
            if name_part:
                # Walmart fuses "QTY ITEM_NAME BARCODE" — extract qty prefix
                pending_name = name_part
            continue

        # Standalone barcode: skip (price expected next)
        if is_barcode(n):
            continue

        # Price token
        price = parse_price(n)
        if price is not None:
            if pending_name:
                qty, clean = extract_quantity_prefix(pending_name)
                items.append({"name": clean, "quantity": qty, "price": price})
                pending_name = None
            continue

        # Name token: accumulate multi-word names more aggressively.
        # A new name starts only when the current token looks like a fresh item
        # (has 4+ alpha chars and isn't a continuation fragment).
        if pending_name:
            # Short fragments (<=3 chars) are always continuations
            if len(n) <= 3:
                pending_name = pending_name + ' ' + n
            # If the pending name is very short, keep building it
            elif len(pending_name) <= 3:
                pending_name = pending_name + ' ' + n
            else:
                # New item name — previous pending had no price
                pending_name = n
        else:
            pending_name = n

    result["items"] = items

    # --- Subtotal ---
    if subtotal_idx + 1 < len(tokens):
        for t in tokens[subtotal_idx + 1: subtotal_idx + 9]:
            p = parse_price(normalise_token(t))
            if p is not None:
                result["subtotal"] = p
                break

    # --- Taxes ---
    i = 0
    while i < len(tokens):
        n = normalise_token(tokens[i])
        if _KW_TAX.search(n) and not _KW_TOTAL.search(n):
            rate_val = amount_val = None
            for j in range(i + 1, min(i + 5, len(tokens))):
                tn = normalise_token(tokens[j])
                p = parse_price(tn)
                if p is None:
                    # check for bare rate like "7.000" or "6.500"
                    try:
                        p = float(tn.replace(',', '.'))
                    except ValueError:
                        continue
                if p is not None:
                    if rate_val is None and p <= 30:
                        rate_val = p
                    elif amount_val is None:
                        amount_val = p
                        break
            if rate_val is not None and amount_val is not None:
                result["taxes"].append({"rate": rate_val, "amount": amount_val})
        i += 1

    # --- Date: last date-like token in receipt ---
    for t in reversed(tokens):
        d = parse_date(t)
        if d:
            result["date"] = d
            break

    # --- Total: search full receipt (subtotal may be corrupted / missing) ---
    # Look forward 8 tokens, then backward 3 tokens (EFT receipts put value before keyword).
    for i, t in enumerate(tokens):
        n = normalise_token(t)
        if _KW_TOTAL.search(n) and not _KW_SUBTOTAL.search(n):
            for t2 in tokens[i + 1: i + 9]:
                p = parse_price(normalise_token(t2))
                if p is not None:
                    result["total"] = p
                    break
            if result["total"] is None:
                for t2 in reversed(tokens[max(0, i - 3): i]):
                    p = parse_price(normalise_token(t2))
                    if p is not None:
                        result["total"] = p
                        break
            if result["total"] is not None:
                break

    # Fallback: if no total found via TOTAL keyword, look for TEND (tender)
    # or SHOPPING CARD payment lines — common on EFT Walmart receipts.
    if result["total"] is None:
        for i, t in enumerate(tokens):
            n = normalise_token(t)
            if (_KW_TENDER.search(n) or re.search(r'\bSHOPPING\s*CARD\b', n, re.IGNORECASE)
                    or re.search(r'\bDEBIT\b', n, re.IGNORECASE)):
                for t2 in tokens[i + 1: i + 5]:
                    p = parse_price(normalise_token(t2))
                    if p is not None:
                        result["total"] = p
                        break
                if result["total"] is not None:
                    break

    return result


# ---------------------------------------------------------------------------
# SPAR parser
# ---------------------------------------------------------------------------

def extract_spar(tokens: list[str]) -> dict:
    result = _empty_result("SPAR")

    # Find item region: after header noise (VAT No / REG NO), before TOTAL
    item_start = 0
    for i, t in enumerate(tokens[:15]):
        n = normalise_token(t)
        if re.search(r'\bVAT\b|\bREG\s*NO\b', n, re.IGNORECASE):
            item_start = i + 2  # skip VAT line and number
    if item_start == 0:
        item_start = 3  # fallback: skip store name + first 2 tokens

    total_idx = len(tokens)
    for i, t in enumerate(tokens):
        n = normalise_token(t)
        if _KW_TOTAL.search(n) and not _KW_SUBTOTAL.search(n):
            total_idx = i
            break

    # Walk items
    items: list[dict] = []
    pending_name: str | None = None
    i = item_start
    while i < total_idx:
        t = tokens[i]
        n = normalise_token(t)

        if is_noise_token(n):
            i += 1
            continue

        if _is_size_token(n):
            i += 1
            continue

        price = parse_price(n)
        if price is not None:
            if pending_name:
                items.append({"name": pending_name, "quantity": 1, "price": price})
                pending_name = None
            i += 1
            continue

        # Skip unit/size that follows (look-ahead)
        pending_name = n
        if i + 1 < total_idx and _is_size_token(normalise_token(tokens[i + 1])):
            i += 2  # consume name + size
        else:
            i += 1

    result["items"] = items

    # Total: after TOTAL token, skip "FOR N ITEMS" if present
    if total_idx + 1 < len(tokens):
        for j in range(total_idx + 1, min(total_idx + 5, len(tokens))):
            p = parse_price(normalise_token(tokens[j]))
            if p is not None:
                result["total"] = p
                break

    # Date (DD,MM,YY format)
    result["date"] = _find_date_in_tokens(tokens, day_first=True)

    return result


# ---------------------------------------------------------------------------
# Harrods parser
# ---------------------------------------------------------------------------

def extract_harrods(tokens: list[str]) -> dict:
    result = _empty_result("Harrods")

    # Date is in header (DD/MM/YY)
    result["date"] = _find_date_in_tokens(tokens[:15], day_first=True)

    # Find "Total to Pay" boundary
    total_pay_idx = len(tokens)
    for i in range(len(tokens) - 1):
        if (re.search(r'\btotal\b', normalise_token(tokens[i]), re.IGNORECASE)
                and re.search(r'\bpay\b', normalise_token(tokens[i + 1]), re.IGNORECASE)):
            total_pay_idx = i
            break

    # Item region: after header block (skip until past VAT/phone lines)
    item_start = 0
    for i, t in enumerate(tokens[:15]):
        n = normalise_token(t)
        if re.search(r'\bVAT\s*Number\b|\bAssistant\b', n, re.IGNORECASE):
            item_start = i + 3  # skip VAT, number, and date token
            break
    if item_start == 0:
        item_start = 5

    # Accumulate tokens until a price → flush as item
    items: list[dict] = []
    pending_tokens: list[str] = []

    for t in tokens[item_start:total_pay_idx]:
        n = normalise_token(t)
        if is_noise_token(n):
            continue
        price = parse_price(n)
        if price is not None:
            name = _harrods_name_from_pending(pending_tokens)
            if name:
                items.append({"name": name, "quantity": 1, "price": price})
            pending_tokens = []
        else:
            pending_tokens.append(n)

    result["items"] = items

    # Total: scan after "Total to Pay" tokens
    for t in tokens[total_pay_idx + 2: total_pay_idx + 8]:
        p = parse_price(normalise_token(t))
        if p is not None:
            result["total"] = p
            break

    return result


def _harrods_name_from_pending(pending: list[str]) -> str | None:
    meaningful = [t for t in pending if re.search(r'[A-Za-z]{3,}', t)]
    if not meaningful:
        return None
    return normalise_token(meaningful[-1])


# ---------------------------------------------------------------------------
# Whole Foods parser
# ---------------------------------------------------------------------------

def extract_whole_foods(tokens: list[str]) -> dict:
    result = _empty_result("Whole Foods")

    # Identify total (BAL keyword) and tax positions
    bal_idx  = next((i for i, t in enumerate(tokens) if re.search(r'\bBAL\b', t, re.IGNORECASE)), -1)
    tax_idxs = {i for i, t in enumerate(tokens) if _KW_TAX.search(normalise_token(t))}

    # Collect all price (index, value) pairs
    price_positions: list[tuple[int, float]] = []
    for i, t in enumerate(tokens):
        p = parse_price(normalise_token(t))
        if p is not None:
            price_positions.append((i, p))

    # Total from BAL
    if bal_idx != -1:
        for t in tokens[bal_idx + 1: bal_idx + 4]:
            p = parse_price(normalise_token(t))
            if p is not None:
                result["total"] = p
                break

    # Tax
    for ti in sorted(tax_idxs):
        for t in tokens[ti + 1: ti + 4]:
            p = parse_price(normalise_token(t))
            if p is not None:
                result["taxes"].append({"rate": 0.0, "amount": p})
                break

    # Exclude total/tax/bal price indices
    exclude_idxs: set[int] = set()
    if bal_idx != -1:
        for i, _ in price_positions:
            if i > bal_idx:
                exclude_idxs.add(i)
    for ti in tax_idxs:
        for i, _ in price_positions:
            if ti < i <= ti + 3:
                exclude_idxs.add(i)
    if result["total"] is not None:
        # Bug fix: exclude only the price token that immediately follows the BAL
        # keyword, not every token whose value happens to equal the total.  The
        # old value-equality check wrongly excluded real item lines whose price
        # coincidentally equalled the receipt total.
        if bal_idx != -1:
            for i, v in price_positions:
                if i > bal_idx and v == result["total"]:
                    exclude_idxs.add(i)
                    break  # only the first match after BAL is the total token

    # Build items from remaining price positions
    items: list[dict] = []
    plu_skip: set[int] = set()

    # Mark PLU code positions ("ITEM", "NNNNN")
    for i, t in enumerate(tokens):
        if re.search(r'\bITEM\b', normalise_token(t), re.IGNORECASE):
            if i + 1 < len(tokens) and _PLU_ITEM_RE.match(normalise_token(tokens[i + 1])):
                plu_skip.update({i, i + 1})

    for pi, price in price_positions:
        if pi in exclude_idxs:
            continue
        # Skip prices preceded by unit descriptors like "ea", "each", "lb"
        # BUT check for "qty @ unit_price ea" pattern first (e.g. "2  $10.00  ea")
        if pi > 0 and _UNIT_DESCRIPTOR.match(normalise_token(tokens[pi - 1])):
            continue

        # Detect "qty @ unit_price" pattern: if a quantity digit precedes this
        # price (within 2 tokens back, possibly with "ea"/"@" in between),
        # multiply price by quantity to get the line total.
        qty_multiplier = 1
        for j in range(pi - 1, max(pi - 3, -1), -1):
            tok_j = normalise_token(tokens[j])
            if _UNIT_DESCRIPTOR.match(tok_j) or tok_j in ('@',):
                continue
            if re.match(r'^\d{1,2}$', tok_j):
                q = int(tok_j)
                if 2 <= q <= 12:
                    qty_multiplier = q
                break
            break
        effective_price = round(price * qty_multiplier, 2)

        # Look back up to 4 tokens for name fragments
        name_parts: list[str] = []
        for j in range(pi - 1, max(pi - 5, -1), -1):
            if j in plu_skip:
                continue
            n = normalise_token(tokens[j])
            if _UNIT_DESCRIPTOR.match(n):
                continue  # skip "ea"/"lb" but keep looking further back
            # Skip single-digit quantity tokens (e.g. "2" before "$10.00")
            if re.match(r'^\d{1,2}$', n):
                continue
            if is_noise_token(n) or is_barcode(n):
                break
            # Stop at address/location tokens (zip codes, state abbreviations)
            if re.match(r'^\d{5}$', n) or re.match(r'^[A-Z]{2}\s+\d{5}', n):
                break
            if (_KW_TAX.search(n) or _KW_SUBTOTAL.search(n)
                    or re.search(r'\bBAL\b|\bTOTAL\b|\bNET\s*SALES?\b', n, re.IGNORECASE)):
                break
            # Stop if we hit another price (don't steal name from adjacent item)
            if parse_price(n) is not None:
                break
            if len(n) >= 2 and not _PLU_ITEM_RE.match(n):
                name_parts.insert(0, n)
        if name_parts:
            name = ' '.join(name_parts)
            # Strip inline prices from name (e.g. "CHEF PLATE MEAL $10" → "CHEF PLATE MEAL")
            name = re.sub(r'\s*\$\d+(?:\.\d+)?\s*$', '', name).strip()
            items.append({"name": name, "quantity": qty_multiplier, "price": effective_price})

    result["items"] = items
    result["date"] = _find_date_in_tokens(tokens)

    # Total fallback: when no BAL keyword is present (modern WF format uses
    # "Total" / "Net Sales" instead), find the first TOTAL keyword and scan
    # forward then backward for its value.
    if result["total"] is None:
        for i, t in enumerate(tokens):
            n = normalise_token(t)
            if _KW_TOTAL.search(n) and not _KW_SUBTOTAL.search(n):
                for t2 in tokens[i + 1: i + 9]:
                    p = parse_price(normalise_token(t2))
                    if p is not None:
                        result["total"] = p
                        break
                if result["total"] is None:
                    for t2 in reversed(tokens[max(0, i - 3): i]):
                        p = parse_price(normalise_token(t2))
                        if p is not None:
                            result["total"] = p
                            break
                if result["total"] is not None:
                    break

    # Subtotal fallback: find SUBTOTAL keyword and take the next valid price.
    if result["subtotal"] is None:
        for i, t in enumerate(tokens):
            if _KW_SUBTOTAL.search(normalise_token(t)):
                for t2 in tokens[i + 1: i + 9]:
                    p = parse_price(normalise_token(t2))
                    if p is not None:
                        result["subtotal"] = p
                        break
                break

    # Sanity check: subtotal shouldn't wildly exceed total (OCR corruption).
    # Common OCR error: leading digit fused (e.g. $28.28 → 828.28).
    if (result["subtotal"] is not None and result["total"] is not None
            and result["subtotal"] > result["total"] * 2):
        result["subtotal"] = None

    return result


# ---------------------------------------------------------------------------
# Costco parser
# ---------------------------------------------------------------------------

_COSTCO_ADDR_RE = re.compile(
    r'\b(St|Ave|Blvd|Rd|Dr|Ln|N\.|S\.|E\.|W\.|Washington|Street|Avenue)\b',
    re.IGNORECASE,
)

def extract_costco(tokens: list[str]) -> dict:
    result = _empty_result("Costco")

    items: list[dict] = []
    pending_name: str | None = None
    pending_qty: int = 1
    pending_price: float | None = None

    def _flush():
        nonlocal pending_name, pending_qty, pending_price
        if pending_name and pending_price is not None:
            items.append({"name": pending_name, "quantity": pending_qty, "price": pending_price})
        pending_name = None
        pending_qty = 1
        pending_price = None

    subtotal_found = False
    floating_price: float | None = None  # price not yet assigned to an item
    for idx, t in enumerate(tokens):
        n = normalise_token(t)

        if is_noise_token(n):
            continue

        # qty@unit_price line
        m = _COSTCO_QTY_RE.match(n)
        if m:
            pending_qty = int(m.group(1))
            continue

        # Item code + name
        m = _COSTCO_ITEM_RE.match(n)
        if m:
            name_candidate = m.group(2).strip()
            # Skip address lines (store street address matches item code pattern)
            if _COSTCO_ADDR_RE.search(name_candidate):
                continue
            _flush()
            floating_price = None
            pending_name = name_candidate
            continue

        # Subtotal keyword: use floating_price if present (subtotal precedes keyword)
        if _KW_SUBTOTAL.search(n):
            _flush()
            if floating_price is not None and result["subtotal"] is None:
                result["subtotal"] = floating_price
                floating_price = None
            subtotal_found = True
            continue

        # After subtotal keyword, look for subtotal value if not already found
        if subtotal_found and result["subtotal"] is None:
            p = parse_price(n)
            if p is not None:
                result["subtotal"] = p
                continue

        # Total (only set once — guards against "TOTAL TAX" footer lines)
        if _KW_TOTAL.search(n) and not _KW_SUBTOTAL.search(n):
            if result["total"] is None:
                for tt in tokens[idx + 1: idx + 5]:
                    p = parse_price(normalise_token(tt))
                    if p is not None:
                        result["total"] = p
                        break
            continue

        # Tax
        if _KW_TAX.search(n) and not _KW_TOTAL.search(n):
            for tt in tokens[idx + 1: idx + 4]:
                p = parse_price(normalise_token(tt))
                if p is not None:
                    result["taxes"].append({"rate": 0.0, "amount": p})
                    break
            continue

        # Price for pending item (only first price per item)
        price = parse_price(n)
        if price is not None:
            if pending_name and pending_price is None:
                pending_price = price
            elif pending_name and pending_price is not None:
                # Second price without a new item code: flush item, store as floating
                _flush()
                floating_price = price
            else:
                floating_price = price
            continue

    _flush()
    result["items"] = items
    result["date"] = _find_date_in_tokens(tokens)
    return result


# ---------------------------------------------------------------------------
# WinCo parser (same structure as Walmart)
# ---------------------------------------------------------------------------

def extract_winco(tokens: list[str]) -> dict:
    result = _empty_result("WinCo Foods")

    subtotal_idx = len(tokens)
    for i, t in enumerate(tokens):
        if _KW_SUBTOTAL.search(normalise_token(t)):
            subtotal_idx = i
            break

    items: list[dict] = []
    pending_name: str | None = None

    for t in tokens[3:subtotal_idx]:  # skip first 2 tokens (store name)
        n = normalise_token(t)

        if is_noise_token(n):
            continue
        if _SINGLE_FLAG.match(n):
            continue

        # Fused name+barcode
        if _BARCODE_TRAILING.search(n):
            name_part = _BARCODE_TRAILING.sub('', n).strip()
            if name_part and not is_noise_token(name_part):
                pending_name = name_part
            continue

        if is_barcode(n):
            continue

        price = parse_price(n)
        if price is not None:
            if pending_name:
                qty, clean = extract_quantity_prefix(pending_name)
                items.append({"name": clean, "quantity": qty, "price": price})
                pending_name = None
            continue

        if pending_name and len(pending_name) <= 3:
            pending_name = pending_name + ' ' + n
        else:
            pending_name = n

    result["items"] = items

    # Subtotal
    if subtotal_idx + 1 < len(tokens):
        for t in tokens[subtotal_idx + 1: subtotal_idx + 4]:
            p = parse_price(normalise_token(t))
            if p is not None:
                result["subtotal"] = p
                break

    # Total (IOTAL is common OCR error for TOTAL in WinCo)
    _KW_TOTAL_WINCO = re.compile(r'\bITOTAL\b|\bIOTAL\b|\btot[a4][l1]\b', re.IGNORECASE)
    for i in range(subtotal_idx, len(tokens)):
        n = normalise_token(tokens[i])
        if _KW_TOTAL_WINCO.search(n) and not _KW_SUBTOTAL.search(n):
            for t in tokens[i + 1: i + 4]:
                p = parse_price(normalise_token(t))
                if p is not None:
                    result["total"] = p
                    break
            break

    result["date"] = _find_date_in_tokens(tokens)
    return result


# ---------------------------------------------------------------------------
# Aldi parser
# ---------------------------------------------------------------------------

def extract_aldi(tokens: list[str]) -> dict:
    """Simple name → price state machine; no loyalty, no dept headers."""
    result = _empty_result("Aldi")

    subtotal_idx = next(
        (i for i, t in enumerate(tokens) if _KW_SUBTOTAL.search(normalise_token(t))),
        len(tokens),
    )

    items: list[dict] = []
    pending_name: str | None = None

    for t in tokens[3:subtotal_idx]:
        n = normalise_token(t)
        if is_noise_token(n) or _SINGLE_FLAG.match(n):
            continue
        if _KW_SUBTOTAL.search(n) or _KW_TOTAL.search(n) or _KW_TAX.search(n):
            continue

        price = parse_price(n)
        if price is not None and price > 0:
            if pending_name:
                qty, clean = extract_quantity_prefix(pending_name)
                items.append({"name": clean, "quantity": qty, "price": price})
                pending_name = None
            continue

        pending_name = n

    result["items"] = items
    _fill_totals(result, tokens, subtotal_idx)
    result["date"] = _find_date_in_tokens(tokens)
    return result


# ---------------------------------------------------------------------------
# Trader Joe's parser
# ---------------------------------------------------------------------------

def _clean_tj_name(token: str) -> str:
    """Clean a Trader Joe's item name: strip category prefix, fix underscores,
    remove trailing size/qty codes like ',10 QZ'."""
    n = _TJ_PREFIX_RE.sub('', token)          # R-CARROTS → CARROTS
    n = n.replace('_', ' ')                    # CARROTS_SHREDDED → CARROTS SHREDDED
    # Strip trailing size descriptors (",10 QZ", ",8 OZ" etc.)
    n = re.sub(r'\s*,\s*\d+\s*(?:QZ|OZ|CT|PK|LB|KG|ML|G)\s*$', '', n, flags=re.IGNORECASE)
    return n.strip()


def extract_trader_joes(tokens: list[str]) -> dict:
    """Clean format: name token followed by price token; T suffix for taxable.

    TJ items often have R-/T-/A- category prefixes and underscore separators.
    """
    result = _empty_result("Trader Joe's")

    # Find header end: skip store name, address, phone, hours
    header_end = 3
    for i, t in enumerate(tokens[:15]):
        n = normalise_token(t)
        if re.search(r'\bStore\s*#\d+\b', n, re.IGNORECASE):
            header_end = i + 1
        elif re.search(r'\bOPEN\b.*\bDAILY\b', n, re.IGNORECASE):
            header_end = i + 1

    subtotal_idx = next(
        (i for i, t in enumerate(tokens) if _KW_SUBTOTAL.search(normalise_token(t))),
        len(tokens),
    )

    items: list[dict] = []
    pending_name: str | None = None

    for t in tokens[header_end:subtotal_idx]:
        n = normalise_token(t)
        if is_noise_token(n) or _SINGLE_FLAG.match(n):
            continue
        if _KW_SUBTOTAL.search(n) or _KW_TOTAL.search(n) or _KW_TAX.search(n):
            continue
        if _UNIT_DESCRIPTOR.match(n):
            continue
        # Skip "GROCERY NON TAXABLE" section headers
        if re.search(r'\bGROCERY\b.*\bTAXABLE\b', n, re.IGNORECASE):
            continue
        # Skip qty-at-price lines like "@ 0.49", "3EA", "0.29/EA"
        if re.match(r'^[@\d]+\s*(?:EA\s*)?@?\s*\d', n, re.IGNORECASE):
            continue
        if re.match(r'^\d+EA$', n, re.IGNORECASE):   # "3EA" quantity descriptor
            continue

        price = parse_price(n)
        if price is not None and price > 0:
            # Skip per-unit prices (e.g. "0.29/EA") — these are breakdowns,
            # not item totals.
            if re.search(r'/EA\b', n, re.IGNORECASE):
                continue
            if pending_name:
                cleaned = _clean_tj_name(pending_name)
                if cleaned and len(cleaned) >= 2:
                    qty, name = extract_quantity_prefix(cleaned)
                    items.append({"name": name, "quantity": qty, "price": price})
                pending_name = None
            continue

        # Clean TJ-specific formatting before accumulating
        cleaned = _clean_tj_name(n)
        if cleaned and len(cleaned) >= 2:
            # Skip tokens that are mostly non-alpha (OCR garbage like "{58")
            alpha_count = sum(1 for c in cleaned if c.isalpha())
            if alpha_count < 2:
                continue
            pending_name = cleaned

    result["items"] = items
    _fill_totals(result, tokens, subtotal_idx)
    result["date"] = _find_date_in_tokens(tokens)

    # TJ-specific: total is often missing (no explicit TOTAL keyword) or
    # the parser picks up the cash tendered amount ($40.00) instead of the
    # actual bill.  When subtotal exists and total is missing or suspiciously
    # round / larger than subtotal, use subtotal as total.
    if result["subtotal"] is not None:
        if result["total"] is None:
            result["total"] = result["subtotal"]
        elif (result["total"] > result["subtotal"]
              and result["total"] == round(result["total"])):
            # Round-dollar total (e.g. $40.00) is almost certainly the cash
            # tender, not the bill.  Replace with subtotal.
            result["total"] = result["subtotal"]

    return result


# ---------------------------------------------------------------------------
# US-grocery shared extractor (Kroger, Safeway, Meijer, Andronico's)
# ---------------------------------------------------------------------------

def extract_us_grocery(tokens: list[str], store_name: str,
                       use_balance: bool = False) -> dict:
    """Shared extractor for department-header US grocery chains.

    Handles:
    - Department headers (PRODUCE, GROCERY, …)            → skip, reset pending
    - Loyalty / savings lines (for U, Club Card, mPerks …)→ skip
    - Weight descriptions ("0.83 lb @ 1.99 /lb")         → skip
    - Qty-at-price lines ("2 @ 3.99")                    → skip
    - Single-letter tax codes (N, T, X, F, D, A, B)      → skip
    - Negative discount tokens                            → skip
    - Barcodes                                            → skip
    """
    result = _empty_result(store_name)

    subtotal_idx = next(
        (i for i, t in enumerate(tokens) if _KW_SUBTOTAL.search(normalise_token(t))),
        len(tokens),
    )

    items: list[dict] = []
    pending_name: str | None = None

    for t in tokens[3:subtotal_idx]:
        n = normalise_token(t)

        if is_noise_token(n):
            continue
        if _DEPT_HEADER.match(n):          # e.g. "PRODUCE", "GROCERY"
            pending_name = None            # reset — dept header is never a name
            continue
        if _SAVINGS_LINE.search(n):        # loyalty / discount description
            continue
        if _WEIGHT_LINE.match(n) or _QTY_AT_LINE.match(n):
            continue
        if _DISCOUNT_LINE.match(n):        # negative price / discount amount
            continue
        if _SINGLE_FLAG.match(n):          # single tax-code letter
            continue
        if is_barcode(n):
            continue
        if _KW_SUBTOTAL.search(n) or _KW_TOTAL.search(n) or _KW_TAX.search(n):
            continue

        price = parse_price(n)
        if price is not None and price > 0:
            if pending_name:
                qty, clean = extract_quantity_prefix(pending_name)
                items.append({"name": clean, "quantity": qty, "price": price})
                pending_name = None
            continue

        if n:
            pending_name = n

    result["items"] = items
    _fill_totals(result, tokens, subtotal_idx, use_balance=use_balance)
    result["date"] = _find_date_in_tokens(tokens)
    return result


def extract_kroger(tokens: list[str]) -> dict:
    """Kroger: same as US-grocery; total uses BALANCE keyword."""
    return extract_us_grocery(tokens, "Kroger", use_balance=True)


def extract_safeway(tokens: list[str]) -> dict:
    return extract_us_grocery(tokens, "Safeway")


def extract_meijer(tokens: list[str]) -> dict:
    return extract_us_grocery(tokens, "Meijer")


def extract_andronicos(tokens: list[str]) -> dict:
    return extract_us_grocery(tokens, "Andronico's")


# ---------------------------------------------------------------------------
# Target parser
# ---------------------------------------------------------------------------

def extract_target(tokens: list[str]) -> dict:
    """Target: optional 9-digit DPCI prefix on item tokens; T=Tax% notation."""
    result = _empty_result("Target")

    subtotal_idx = next(
        (i for i, t in enumerate(tokens) if _KW_SUBTOTAL.search(normalise_token(t))),
        len(tokens),
    )

    items: list[dict] = []
    pending_name: str | None = None

    for t in tokens[3:subtotal_idx]:
        n = normalise_token(t)

        if is_noise_token(n):
            continue
        if _TARGET_TAX_RE.search(n):       # "T = CA Tax 9.25%" line
            continue
        if _SAVINGS_LINE.search(n):
            continue
        if _SINGLE_FLAG.match(n):
            continue
        if _KW_SUBTOTAL.search(n) or _KW_TOTAL.search(n) or _KW_TAX.search(n):
            continue

        # Strip leading 9-digit DPCI code (e.g. "012345678 ITEM NAME")
        n_stripped = _TARGET_DPCI.sub('', n).strip()
        if n_stripped:
            n = n_stripped

        price = parse_price(n)
        if price is not None and price > 0:
            if pending_name:
                qty, clean = extract_quantity_prefix(pending_name)
                items.append({"name": clean, "quantity": qty, "price": price})
                pending_name = None
            continue

        if n:
            pending_name = n

    result["items"] = items

    # Standard totals first (fills subtotal and generic tax)
    _fill_totals(result, tokens, subtotal_idx)

    # Override taxes with Target-specific "T = CA Tax N.NN%" detection
    result["taxes"] = []
    for i, t in enumerate(tokens):
        n = normalise_token(t)
        if _TARGET_TAX_RE.search(n):
            rate_m = re.search(r'(\d+[.,]\d+)\s*%', n)
            rate = float(rate_m.group(1).replace(',', '.')) if rate_m else 0.0
            for tt in tokens[i + 1: i + 4]:
                p = parse_price(normalise_token(tt))
                if p is not None:
                    result["taxes"].append({"rate": rate, "amount": p})
                    break
        elif (_KW_TAX.search(n)
              and not _KW_TOTAL.search(n)
              and not _KW_SUBTOTAL.search(n)):
            for tt in tokens[i + 1: i + 4]:
                p = parse_price(normalise_token(tt))
                if p is not None:
                    result["taxes"].append({"rate": 0.0, "amount": p})
                    break

    result["date"] = _find_date_in_tokens(tokens)
    return result


# ---------------------------------------------------------------------------
# 99 Ranch parser
# ---------------------------------------------------------------------------

def extract_99ranch(tokens: list[str]) -> dict:
    """99 Ranch: bilingual receipt; Chinese-character tokens are skipped."""
    result = _empty_result("99 Ranch")

    subtotal_idx = next(
        (i for i, t in enumerate(tokens) if _KW_SUBTOTAL.search(normalise_token(t))),
        len(tokens),
    )

    items: list[dict] = []
    pending_name: str | None = None

    for t in tokens[3:subtotal_idx]:
        n = normalise_token(t)

        if _CHINESE_LINE.search(n):        # skip Chinese-character tokens
            continue
        if is_noise_token(n) or _SINGLE_FLAG.match(n):
            continue
        if is_barcode(n):
            continue
        if _KW_SUBTOTAL.search(n) or _KW_TOTAL.search(n) or _KW_TAX.search(n):
            continue

        price = parse_price(n)
        if price is not None and price > 0:
            if pending_name:
                qty, clean = extract_quantity_prefix(pending_name)
                items.append({"name": clean, "quantity": qty, "price": price})
                pending_name = None
            continue

        if n:
            pending_name = n

    result["items"] = items
    _fill_totals(result, tokens, subtotal_idx)
    result["date"] = _find_date_in_tokens(tokens)
    return result


# ---------------------------------------------------------------------------
# Generic fallback parser
# ---------------------------------------------------------------------------

def extract_generic(tokens: list[str]) -> dict:
    result = _empty_result("Unknown")

    # Collect all price positions
    price_positions: list[tuple[int, float]] = []
    for i, t in enumerate(tokens):
        p = parse_price(normalise_token(t))
        if p is not None:
            price_positions.append((i, p))

    if not price_positions:
        return result

    # Identify total: use LAST total keyword (avoids column headers like "Total")
    total_price_idx: int | None = None
    for i, t in reversed(list(enumerate(tokens))):
        n = normalise_token(t)
        if _KW_TOTAL.search(n) and not _KW_SUBTOTAL.search(n):
            for j in range(i + 1, min(i + 4, len(tokens))):
                p = parse_price(normalise_token(tokens[j]))
                if p is not None:
                    result["total"] = p
                    total_price_idx = j
                    break
            if result["total"] is not None:
                break

    exclude_idxs: set[int] = set()
    if total_price_idx is not None:
        exclude_idxs.add(total_price_idx)

    # Subtotal
    for i, t in enumerate(tokens):
        if _KW_SUBTOTAL.search(normalise_token(t)):
            for tt in tokens[i + 1: i + 4]:
                p = parse_price(normalise_token(tt))
                if p is not None:
                    result["subtotal"] = p
                    break
            break

    # Tax
    for i, t in enumerate(tokens):
        if _KW_TAX.search(normalise_token(t)):
            for tt in tokens[i + 1: i + 4]:
                p = parse_price(normalise_token(tt))
                if p is not None:
                    result["taxes"].append({"rate": 0.0, "amount": p})
                    break

    # Bug fix: also exclude the tax-value token indices so that tax amounts
    # are not picked up as item prices in the generic fallback.
    for i, t in enumerate(tokens):
        if _KW_TAX.search(normalise_token(t)):
            for j in range(i + 1, min(i + 4, len(tokens))):
                p = parse_price(normalise_token(tokens[j]))
                if p is not None:
                    exclude_idxs.add(j)
                    break

    # Items: for each price, look back for a name
    items: list[dict] = []
    for pi, price in price_positions:
        if pi in exclude_idxs:
            continue
        name_parts: list[str] = []
        for j in range(pi - 1, max(pi - 5, -1), -1):
            n = normalise_token(tokens[j])
            if is_noise_token(n) or is_barcode(n):
                break
            if _KW_TAX.search(n) or _KW_TOTAL.search(n) or _KW_SUBTOTAL.search(n):
                break
            if parse_price(n) is not None:
                break
            if len(n) >= 2:
                name_parts.insert(0, n)
        if name_parts:
            name = ' '.join(name_parts)
            qty, clean = extract_quantity_prefix(name)
            items.append({"name": clean, "quantity": qty, "price": price})

    result["items"] = items
    result["date"] = _find_date_in_tokens(tokens)
    return result


# ---------------------------------------------------------------------------
# Ensemble OCR merge (combine detections from multiple engines)
# ---------------------------------------------------------------------------

_RECEIPT_KW = re.compile(
    r'\bsubtot|\btot[a4]|\bt[a4][x%]|\btend|\bchange|\bcash|\bvisa\b|\bdebit\b',
    re.IGNORECASE,
)


def _bbox_to_rect(bbox) -> tuple[float, float, float, float]:
    """Convert a 4-point polygon to (x_min, y_min, x_max, y_max)."""
    xs = [p[0] for p in bbox]
    ys = [p[1] for p in bbox]
    return (min(xs), min(ys), max(xs), max(ys))


def _rect_iou(a: tuple, b: tuple) -> float:
    """Intersection-over-union for two axis-aligned rectangles."""
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _y_mid(bbox) -> float:
    ys = [p[1] for p in bbox]
    return (min(ys) + max(ys)) / 2


def _pick_winner(det_a: tuple, det_b: tuple) -> tuple:
    """Choose the better detection from a matched pair.

    Primary: higher confidence.
    Tiebreak (within 0.1): prefer text that looks like a valid price or
    receipt keyword — these are the fields where OCR quality matters most.
    """
    conf_a, conf_b = det_a[2], det_b[2]

    if abs(conf_a - conf_b) <= 0.1:
        # Tiebreak: prefer receipt-meaningful text
        score_a = score_b = 0
        if parse_price(normalise_token(det_a[1])) is not None:
            score_a += 2
        if parse_price(normalise_token(det_b[1])) is not None:
            score_b += 2
        if _RECEIPT_KW.search(det_a[1]):
            score_a += 1
        if _RECEIPT_KW.search(det_b[1]):
            score_b += 1
        if score_a != score_b:
            return det_a if score_a > score_b else det_b

    return det_a if conf_a >= conf_b else det_b


def ensemble_merge(
    dets_a: list[tuple],
    dets_b: list[tuple],
    iou_thresh: float = 0.3,
    y_tol: int = 20,
    text_sim_thresh: float = 0.5,
    min_conf: float = 0.15,
) -> list[tuple]:
    """Merge detections from two OCR engines into a single unified list.

    Uses a hybrid matching strategy: IoU for overlapping boxes, plus
    Y-band + text similarity for boxes that barely overlap but clearly
    represent the same text region.

    Parameters
    ----------
    dets_a, dets_b : list of (bbox, text, confidence) tuples
    iou_thresh : float
        Minimum IoU to consider two detections as the same region.
    y_tol : int
        Maximum y-midpoint distance (px) for Y-band matching.
    text_sim_thresh : float
        Minimum SequenceMatcher ratio for text similarity matching.
    min_conf : float
        Drop unmatched detections below this confidence.

    Returns
    -------
    list[tuple]
        Merged detections ready for ``spatial_reorder()``.
    """
    if not dets_a:
        return [d for d in dets_b if d[2] >= min_conf]
    if not dets_b:
        return [d for d in dets_a if d[2] >= min_conf]

    rects_a = [_bbox_to_rect(d[0]) for d in dets_a]
    rects_b = [_bbox_to_rect(d[0]) for d in dets_b]

    # ── Greedy 1-to-1 matching: A → B ────────────────────────────────────
    claimed_b: set[int] = set()
    matched: list[tuple[int, int]] = []     # (idx_a, idx_b)

    for i, det_a in enumerate(dets_a):
        best_j = -1
        best_score = 0.0
        y_a = _y_mid(det_a[0])
        text_a = det_a[1].upper()

        for j, det_b in enumerate(dets_b):
            if j in claimed_b:
                continue

            iou = _rect_iou(rects_a[i], rects_b[j])
            y_close = abs(y_a - _y_mid(det_b[0])) <= y_tol
            text_sim = difflib.SequenceMatcher(
                None, text_a, det_b[1].upper(),
            ).ratio()

            is_match = (iou >= iou_thresh) or (y_close and text_sim >= text_sim_thresh)
            if not is_match:
                continue

            score = iou * 0.5 + text_sim * 0.5
            if score > best_score:
                best_score = score
                best_j = j

        if best_j >= 0:
            claimed_b.add(best_j)
            matched.append((i, best_j))

    # ── Resolve matched pairs ────────────────────────────────────────────
    merged: list[tuple] = []
    matched_a = {m[0] for m in matched}

    for i_a, i_b in matched:
        winner = _pick_winner(dets_a[i_a], dets_b[i_b])
        merged.append(winner)

    # ── Add unmatched (complementary coverage) ───────────────────────────
    for i, det in enumerate(dets_a):
        if i not in matched_a and det[2] >= min_conf:
            merged.append(det)

    for j, det in enumerate(dets_b):
        if j not in claimed_b and det[2] >= min_conf:
            merged.append(det)

    # ── Post-merge dedup within Y-bands ──────────────────────────────────
    # Two surviving detections on the same line with very similar text are
    # almost certainly the same token detected by both engines but not
    # caught by IoU matching (e.g. slightly shifted boxes).
    #
    # Also catches partial overlaps: if one text is a substring of the
    # other on the same line (e.g. "BEANS" vs "BLACK BEANS"), keep the
    # longer one — it has more context for the parser.
    merged.sort(key=lambda d: _y_mid(d[0]))
    deduped: list[tuple] = []
    for det in merged:
        y = _y_mid(det[0])
        t_upper = det[1].upper().strip()
        dup = False
        for idx, existing in enumerate(deduped):
            if abs(_y_mid(existing[0]) - y) > y_tol:
                continue
            e_upper = existing[1].upper().strip()
            sim = difflib.SequenceMatcher(None, t_upper, e_upper).ratio()

            # High text similarity — near-duplicate
            if sim > 0.8:
                if det[2] > existing[2]:
                    deduped[idx] = det
                dup = True
                break

            # Substring containment — one engine read a subset of the other
            if len(t_upper) >= 3 and len(e_upper) >= 3:
                if t_upper in e_upper:
                    dup = True  # existing is longer, keep it
                    break
                if e_upper in t_upper:
                    deduped[idx] = det  # new one is longer, replace
                    dup = True
                    break

        if not dup:
            deduped.append(det)

    return deduped


# ---------------------------------------------------------------------------
# Spatial reordering (detail=1 bounding-box pre-processor)
# ---------------------------------------------------------------------------


def spatial_reorder(
    detections: list[tuple],
    y_tolerance: int = 25,
    force_band_order: bool = False,
) -> list[str]:
    """Convert easyOCR ``detail=1`` output into well-ordered flat tokens.

    Receipt images typically have two columns: item names on the left and
    prices on the right.  easyOCR reads blocks in raster order (top-to-bottom,
    left-to-right within a block), but may interleave columns unpredictably.

    This function groups detections into horizontal bands by Y-midpoint, then
    within each band emits left-column tokens before right-column tokens.  The
    result is a flat ``list[str]`` identical in format to ``detail=0`` output
    but with correct *name → price* sequencing that the downstream parser
    relies on.

    Parameters
    ----------
    detections : list of ``(bbox, text, confidence)`` tuples
        Raw easyOCR ``detail=1`` output.  Each *bbox* is a list of four
        ``[x, y]`` corner points.
    y_tolerance : int
        Maximum vertical distance (pixels) between two detections to be
        grouped on the same line.
    force_band_order : bool
        When True, always group into Y-bands and sort left-to-right within
        each band, even when no clear two-column layout is detected.  Use
        this for ensemble-merged detections where the input order is
        arbitrary.  Default False preserves single-engine reading order.

    Returns
    -------
    list[str]
        Flat token list suitable for ``parse_receipt()``.
    """
    if not detections:
        return []

    # ── 1. Extract geometry ──────────────────────────────────────────────
    entries: list[dict] = []
    for bbox, text, conf in detections:
        if not text or not text.strip():
            continue
        xs = [p[0] for p in bbox]
        ys = [p[1] for p in bbox]
        entries.append({
            'text': text,
            'x_min': min(xs),
            'x_max': max(xs),
            'x_mid': (min(xs) + max(xs)) / 2,
            'y_mid': (min(ys) + max(ys)) / 2,
            'conf': conf,
        })

    if not entries:
        return []

    # ── 2. Determine column split ────────────────────────────────────────
    x_range = max(e['x_max'] for e in entries) - min(e['x_min'] for e in entries)
    col_threshold: float | None = None
    use_bands = force_band_order

    if x_range >= 100:
        x_mins_sorted = sorted(set(e['x_min'] for e in entries))
        best_gap = 0.0
        best_gap_pos = 0.0
        for i in range(1, len(x_mins_sorted)):
            gap = x_mins_sorted[i] - x_mins_sorted[i - 1]
            if gap > best_gap:
                best_gap = gap
                best_gap_pos = (x_mins_sorted[i - 1] + x_mins_sorted[i]) / 2

        if best_gap >= x_range * 0.15:
            col_threshold = best_gap_pos
            use_bands = True   # two-column always uses band ordering

    if not use_bands:
        # Single-engine, single-column: preserve easyOCR reading order.
        return [e['text'] for e in entries]

    # ── 3. Group into Y-bands ────────────────────────────────────────────
    entries.sort(key=lambda e: e['y_mid'])

    bands: list[list[dict]] = []
    current_band: list[dict] = [entries[0]]

    for e in entries[1:]:
        band_y = sum(b['y_mid'] for b in current_band) / len(current_band)
        if abs(e['y_mid'] - band_y) <= y_tolerance:
            current_band.append(e)
        else:
            bands.append(current_band)
            current_band = [e]
    bands.append(current_band)

    # ── 4. Emit tokens: left-to-right within each band ───────────────────
    tokens: list[str] = []
    for band in bands:
        if col_threshold is not None:
            left = sorted([e for e in band if e['x_mid'] < col_threshold],
                          key=lambda e: e['x_min'])
            right = sorted([e for e in band if e['x_mid'] >= col_threshold],
                           key=lambda e: e['x_min'])
            for e in left:
                tokens.append(e['text'])
            for e in right:
                tokens.append(e['text'])
        else:
            for e in sorted(band, key=lambda e: e['x_min']):
                tokens.append(e['text'])

    return tokens


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------

def parse_receipt(tokens: list[str]) -> dict:
    """Parse a flat easyOCR (detail=0) token list into structured receipt metadata."""
    # Correct systematic OCR substitution errors before any pattern matching.
    tokens = _normalise_ocr_tokens(tokens)
    store = detect_store(tokens)

    dispatch: dict[str | None, object] = {
        'Walmart':          extract_walmart,
        'Harrods':          extract_harrods,
        'SPAR':             extract_spar,
        'Whole Foods':      extract_whole_foods,
        'Costco/Thornton':  extract_costco,
        'Costco':           extract_costco,
        'WinCo Foods':      extract_winco,
        'Aldi':             extract_aldi,
        'Kroger':           extract_kroger,
        'Safeway':          extract_safeway,
        'Meijer':           extract_meijer,
        'Target':           extract_target,
        "Trader Joe's":     extract_trader_joes,
        '99 Ranch':         extract_99ranch,
        "Andronico's":      extract_andronicos,
    }

    extractor = dispatch.get(store, extract_generic)
    result = extractor(tokens)  # type: ignore[operator]
    result['store'] = store or 'Unknown'
    return result
