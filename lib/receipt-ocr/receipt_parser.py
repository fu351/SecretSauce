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

_BARCODE_STANDALONE = re.compile(r'^\d{10,15}$')
_BARCODE_TRAILING   = re.compile(r'\s\d{10,15}$')

_KW_SUBTOTAL = re.compile(r'\bsubt[o0]', re.IGNORECASE)
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
_DATE_SLASH   = re.compile(r'^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})')
_DATE_COMMA   = re.compile(r'^(\d{1,2})[,](\d{1,2})[,](\d{2,4})')

_STORE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\bwal[\s\-]?mart\b|\bwalmar[t]?\b|\bvalnart\b', re.IGNORECASE), 'Walmart'),
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

_COSTCO_ITEM_RE = re.compile(r'^(\d{5,6})\s+(.+)$')
_COSTCO_QTY_RE  = re.compile(r'^(\d+)\s*@\s*(\d+[.,]\d{2})$')
_PLU_ITEM_RE    = re.compile(r'^\d{4,6}$')  # Whole Foods PLU codes
_SINGLE_FLAG    = re.compile(r'^[A-Za-z]$')
_ST_LINE_RE     = re.compile(r'\bST#\s*\d+|\bOP#\s*\d+', re.IGNORECASE)

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
# Helper functions
# ---------------------------------------------------------------------------

def normalise_token(token: str) -> str:
    return re.sub(r'\s+', ' ', token).strip()


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
    return False


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
        if 1 <= month <= 12 and 1 <= day <= 31:
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
    return any(t.endswith(u) for u in units)


def _find_date_in_tokens(tokens: list[str], day_first: bool = False) -> str | None:
    """Return the first date found scanning the token list."""
    for t in tokens:
        d = parse_date(t, day_first=day_first)
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
    # Subtotal value: look in the few tokens immediately after SUBTOTAL keyword
    if subtotal_idx < len(tokens):
        for t in tokens[subtotal_idx + 1: subtotal_idx + 5]:
            p = parse_price(normalise_token(t))
            if p is not None:
                result["subtotal"] = p
                break

    # Tax lines
    for i, t in enumerate(tokens):
        n = normalise_token(t)
        if (_KW_TAX.search(n)
                and not _KW_TOTAL.search(n)
                and not _KW_SUBTOTAL.search(n)):
            for tt in tokens[i + 1: i + 5]:
                p = parse_price(normalise_token(tt))
                if p is not None:
                    result["taxes"].append({"rate": 0.0, "amount": p})
                    break

    # Total
    total_kw = _KW_TOTAL_OR_BALANCE if use_balance else _KW_TOTAL
    for i, t in enumerate(tokens):
        n = normalise_token(t)
        if (total_kw.search(n)
                and not _KW_SUBTOTAL.search(n)
                and not _KW_TAX.search(n)):
            for tt in tokens[i + 1: i + 5]:
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

    # Whole Foods requires both WHOLE and FOODS within 5 positions
    whole_idx = next((i for i, t in enumerate(header) if _WHOLE_RE.search(t)), -1)
    foods_idx = next(
        (i for i, t in enumerate(header) if _FOODS_RE.search(t) and i != whole_idx), -1
    )
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

    return None


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

        # Name+barcode fused: strip trailing barcode
        if _BARCODE_TRAILING.search(n):
            name_part = _BARCODE_TRAILING.sub('', n).strip()
            if name_part:
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

        # Name token
        if pending_name and len(pending_name) <= 3:
            pending_name = pending_name + ' ' + n
        else:
            pending_name = n

    result["items"] = items

    # --- Subtotal ---
    if subtotal_idx + 1 < len(tokens):
        for t in tokens[subtotal_idx + 1: subtotal_idx + 4]:
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
    for i, t in enumerate(tokens):
        n = normalise_token(t)
        if _KW_TOTAL.search(n) and not _KW_SUBTOTAL.search(n):
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
        # exclude the total price index
        for i, v in price_positions:
            if v == result["total"]:
                exclude_idxs.add(i)

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
        # Look back up to 3 tokens for name fragments
        name_parts: list[str] = []
        for j in range(pi - 1, max(pi - 4, -1), -1):
            if j in plu_skip:
                continue
            n = normalise_token(tokens[j])
            if is_noise_token(n) or is_barcode(n):
                break
            if _KW_TAX.search(n) or re.search(r'\bBAL\b|\bTOTAL\b', n, re.IGNORECASE):
                break
            # Stop if we hit another price (don't steal name from adjacent item)
            if parse_price(n) is not None:
                break
            if len(n) >= 2 and not _PLU_ITEM_RE.match(n):
                name_parts.insert(0, n)
        if name_parts:
            name = ' '.join(name_parts)
            items.append({"name": name, "quantity": 1, "price": price})

    result["items"] = items
    result["date"] = _find_date_in_tokens(tokens)
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

def extract_trader_joes(tokens: list[str]) -> dict:
    """Clean format: name token followed by price token; T suffix for taxable."""
    result = _empty_result("Trader Joe's")

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
# Unified entry point
# ---------------------------------------------------------------------------

def parse_receipt(tokens: list[str]) -> dict:
    """Parse a flat easyOCR (detail=0) token list into structured receipt metadata."""
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
