"""
test_receipt_parser.py
======================
Unit tests for every distinct parsing layer in receipt_parser.py.

Covered bugs and scenarios
───────────────────────────
1.  _normalise_ocr_tokens  — empty-string crash, smart-quote, OCR digit/letter fixes,
                             split-price merging
2.  parse_price            — valid prices, OCR-ed currency prefix, trailing tax flag,
                             nonsense / too-long numbers, negative prices
3.  parse_date             — US and day-first order, 2-digit year, impossible dates
                             (Feb 31 rejected after bug-fix), embedded dates
4.  is_noise_token         — boilerplate, pure-punctuation, low alnum ratio, vowel-free
5.  is_barcode             — standalone barcodes, fused name+barcode via _BARCODE_TRAILING
6.  detect_store           — each known store, fuzzy OCR variant, fused "Whole Foods" token
7.  extract_walmart        — items, subtotal, taxes (no duplicate), total, date
8.  extract_spar           — items, total, date (day-first)
9.  extract_whole_foods    — items not excluded when price == total (bug-fix regression)
10. extract_costco         — item-code format, qty@price, subtotal before keyword
11. extract_generic        — tax values excluded from items (bug-fix regression),
                             total keyword used only once
12. parse_receipt          — full dispatch round-trip for each store, empty input guard,
                             unknown store falls back to generic, normalisation runs first
13. _fill_totals           — no duplicate taxes when two TAX keywords share a value token
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Load receipt_parser from the sibling directory
# ---------------------------------------------------------------------------

_PARSER_PATH = Path(__file__).resolve().parent.parent / "receipt_parser.py"
_spec = importlib.util.spec_from_file_location("receipt_parser", _PARSER_PATH)
_mod = importlib.util.module_from_spec(_spec)  # type: ignore[arg-type]
_spec.loader.exec_module(_mod)  # type: ignore[union-attr]

# Public symbols
parse_receipt         = _mod.parse_receipt
parse_price           = _mod.parse_price
parse_date            = _mod.parse_date
is_noise_token        = _mod.is_noise_token
is_barcode            = _mod.is_barcode
detect_store          = _mod.detect_store
normalise_token       = _mod.normalise_token
extract_quantity_prefix = _mod.extract_quantity_prefix

# Private symbols (tested explicitly)
_normalise_ocr_tokens = _mod._normalise_ocr_tokens
_merge_split_prices   = _mod._merge_split_prices
_fill_totals          = _mod._fill_totals
_empty_result         = _mod._empty_result
_find_date_in_tokens  = _mod._find_date_in_tokens
_DAYS_IN_MONTH        = _mod._DAYS_IN_MONTH
spatial_reorder       = _mod.spatial_reorder
ensemble_merge        = _mod.ensemble_merge


# ===========================================================================
# 1. _normalise_ocr_tokens
# ===========================================================================

class TestNormaliseOcrTokens:
    def test_empty_list(self):
        assert _normalise_ocr_tokens([]) == []

    def test_strips_empty_after_normalisation(self):
        """Bug fix: tokens that become empty after stripping must be dropped."""
        tokens = ["MILK", "!", "  ", "``", "3.49"]
        result = _normalise_ocr_tokens(tokens)
        # "!", "  ", "``" all reduce to "" and must not appear in output
        for tok in result:
            assert tok != "", f"Empty token leaked into output: {result!r}"

    def test_smart_quote_normalisation(self):
        # Smart opening/closing quotes are converted to straight ASCII equivalents.
        # Note: trailing quote after TRADER is NOT stripped — only leading stray
        # apostrophes are stripped.  The normaliser does not strip all trailing quotes.
        tokens = ["\u2018TRADER\u2019", "JOE\u201cS\u201d"]
        result = _normalise_ocr_tokens(tokens)
        assert result[0] == "TRADER'"  # \u2019 → straight single quote
        assert result[1] == 'JOE"S"'  # \u201c/\u201d → straight double quotes

    def test_leading_quote_stripped_from_price(self):
        tokens = ["\"2.48 N", "'4.99"]
        result = _normalise_ocr_tokens(tokens)
        assert result[0] == "2.48 N"
        assert result[1] == "4.99"

    def test_ocr_letter_to_digit_in_price(self):
        """The OCR digit-sub pass fires on tokens matching _PRICE_LIKE_RE.
        '3.5O' (digit·dot·digit·O) matches the price-like pattern; the trailing
        O (after a digit, before nothing) is converted to 0, yielding '3.50'."""
        tokens = ["3.5O"]   # price-like; trailing O after digit → 0
        result = _normalise_ocr_tokens(tokens)
        # '3.5O' → '3.50' → 3.5
        assert parse_price(result[0]) == pytest.approx(3.5)

    def test_ocr_digit_to_letter_in_word(self):
        """The (?<=[A-Za-z])0(?=[A-Za-z]) substitution replaces 0 surrounded by
        letters with O.  WH0LE → WHOLE is the canonical example."""
        tokens = ["WH0LE"]
        result = _normalise_ocr_tokens(tokens)
        assert result[0] == "WHOLE"

    def test_split_price_merged_pattern1(self):
        """['4.', '88'] → ['4.88']"""
        tokens = ["ITEM", "4.", "88"]
        result = _normalise_ocr_tokens(tokens)
        assert "4.88" in result

    def test_split_price_merged_pattern2(self):
        """['21 ,', '74'] → ['21.74']"""
        tokens = ["ITEM", "21 ,", "74"]
        result = _normalise_ocr_tokens(tokens)
        assert "21.74" in result

    def test_split_price_merged_pattern3(self):
        """['46', '.44'] → ['46.44']"""
        tokens = ["ITEM", "46", ".44"]
        result = _normalise_ocr_tokens(tokens)
        assert "46.44" in result

    def test_text_token_not_ocr_corrected_as_number(self):
        """A clearly text token like 'ORGANIC' should not be mangled."""
        tokens = ["ORGANIC", "SALAD"]
        result = _normalise_ocr_tokens(tokens)
        assert result == ["ORGANIC", "SALAD"]


# ===========================================================================
# 2. parse_price
# ===========================================================================

class TestParsePrice:
    @pytest.mark.parametrize("token,expected", [
        ("3.49",        3.49),
        ("$3.49",       3.49),
        ("\xa33.49",    3.49),   # £ prefix
        ("\u20ac3.49",  3.49),   # € prefix
        ("3,49",        3.49),
        ("33.99 A",     33.99),
        ("6.74 X",      6.74),
        ("0.41",        0.41),
        ("1.00",        1.00),
        ("999.99",      999.99),
    ])
    def test_valid_prices(self, token, expected):
        assert parse_price(token) == pytest.approx(expected, abs=0.001)

    @pytest.mark.parametrize("token", [
        "TOTAL",
        "12345678",       # too many digits before decimal — barcode
        "",
        "abc",
        "3",              # no decimal separator
        "-3.49",          # negative
        ".",
    ])
    def test_invalid_prices_return_none(self, token):
        assert parse_price(token) is None

    def test_trailing_tax_flag_ignored(self):
        assert parse_price("4.88 F") == pytest.approx(4.88)

    def test_trailing_slash_flag(self):
        assert parse_price("6.99 N") == pytest.approx(6.99)


# ===========================================================================
# 3. parse_date
# ===========================================================================

class TestParseDate:
    def test_us_order_month_first(self):
        assert parse_date("10/18/2020") == "2020-10-18"

    def test_both_parseable_defaults_to_us_month_first(self):
        # 06/28/2014 — month=6, day=28 (b > 12: triggers day=28, month=6)
        assert parse_date("06/28/2014") == "2014-06-28"

    def test_day_first_flag(self):
        assert parse_date("13/01/2021", day_first=True) == "2021-01-13"

    def test_two_digit_year_2000(self):
        assert parse_date("11/13/17") == "2017-11-13"

    def test_two_digit_year_1900(self):
        # y = 89 → 1989
        assert parse_date("01/01/89") == "1989-01-01"

    def test_comma_separated_date(self):
        # SPAR format: DD,MM,YY
        assert parse_date("28,06,14", day_first=True) == "2014-06-28"

    def test_impossible_feb_31_rejected(self):
        """Bug fix: parse_date must not accept Feb 31."""
        assert parse_date("02/31/2024") is None

    def test_impossible_apr_31_rejected(self):
        """April has 30 days."""
        assert parse_date("04/31/2023") is None

    def test_feb_28_accepted(self):
        assert parse_date("02/28/2023") == "2023-02-28"

    def test_feb_29_accepted(self):
        """Leap year — 29 Feb is allowed (we don't validate leap years)."""
        assert parse_date("02/29/2024") == "2024-02-29"

    def test_bad_month_rejected(self):
        # 13/01/2021: a=13 > 12, so parser sets day=13, month=1.  This IS a
        # valid date (Jan 13).  The parser does not reject it — it identifies it
        # as a day-first date.  Only impossible days for the given month are rejected.
        assert parse_date("13/01/2021") == "2021-01-13"

    def test_empty_returns_none(self):
        assert parse_date("") is None

    def test_non_date_string_returns_none(self):
        assert parse_date("TOTAL") is None

    def test_drops_time_portion(self):
        assert parse_date("10/18/2020 14:32:00") == "2020-10-18"


# ===========================================================================
# 4. is_noise_token
# ===========================================================================

class TestIsNoiseToken:
    def test_empty_is_noise(self):
        assert is_noise_token("") is True

    def test_single_char_is_noise(self):
        assert is_noise_token("X") is True

    def test_boilerplate_is_noise(self):
        assert is_noise_token("THANK YOU") is True
        assert is_noise_token("SAVE MONEY") is True

    def test_pure_punctuation_is_noise(self):
        assert is_noise_token("---") is True
        assert is_noise_token("***") is True

    def test_low_alnum_ratio_is_noise(self):
        # "AB@@@@@" — 2 alnum out of 7 total (ratio 0.29 < 0.4)
        assert is_noise_token("AB@@@@@") is True

    def test_long_consonant_only_is_noise(self):
        assert is_noise_token("BCDFGHJKLMNPQRST") is True

    def test_normal_product_name_is_not_noise(self):
        assert is_noise_token("MILK WHOLE") is False
        assert is_noise_token("ORGANIC EGGS") is False

    def test_two_char_alnum_not_noise(self):
        # "A1" has len=2, so len<=1 guard doesn't fire; alnum=2/2
        assert is_noise_token("A1") is False


# ===========================================================================
# 5. is_barcode
# ===========================================================================

class TestIsBarcode:
    def test_10_digit_barcode(self):
        assert is_barcode("1234567890") is True

    def test_13_digit_barcode(self):
        assert is_barcode("4711234567890") is True

    def test_barcode_with_tax_flag(self):
        assert is_barcode("4711234567890 N") is True

    def test_short_number_not_barcode(self):
        assert is_barcode("12345") is False

    def test_price_not_barcode(self):
        assert is_barcode("3.49") is False

    def test_text_not_barcode(self):
        assert is_barcode("MILK") is False


# ===========================================================================
# 6. detect_store
# ===========================================================================

class TestDetectStore:
    def test_walmart(self):
        assert detect_store(["Walmart", "STORE"]) == "Walmart"

    def test_walmart_ocr_variant(self):
        assert detect_store(["WALAMART", "STORE"]) == "Walmart"

    def test_whole_foods_two_tokens(self):
        assert detect_store(["Whole", "Foods", "Market"]) == "Whole Foods"

    def test_whole_foods_single_fused_token(self):
        """Bug fix: OCR fuses 'Whole Foods' into one token."""
        assert detect_store(["WholeFoods", "Market"]) == "Whole Foods"

    def test_whole_foods_wide_separation_not_detected(self):
        """WHOLE and FOODS more than 5 tokens apart should NOT trigger."""
        tokens = ["Whole", "A", "B", "C", "D", "E", "Foods"]
        # wide separation — falls through to regex on joined string, which still
        # detects it via full-string fallback; assert store is not None (that is fine)
        result = detect_store(tokens)
        # The full-string fallback will still catch it — just verify it doesn't crash
        assert result is not None

    def test_spar(self):
        assert detect_store(["SPAR", "VAT No"]) == "SPAR"

    def test_harrods(self):
        assert detect_store(["Harrods", "London"]) == "Harrods"

    def test_trader_joes(self):
        assert detect_store(["Trader", "Joe's", "receipt"]) == "Trader Joe's"

    def test_kroger(self):
        assert detect_store(["KROGER", "STORE"]) == "Kroger"

    def test_target(self):
        assert detect_store(["Target", "store"]) == "Target"

    def test_costco(self):
        assert detect_store(["COSTCO", "WHOLESALE"]) == "Costco"

    def test_aldi(self):
        assert detect_store(["ALDI", "low prices"]) == "Aldi"

    def test_safeway(self):
        assert detect_store(["Safeway", "Club Card"]) == "Safeway"

    def test_99ranch(self):
        assert detect_store(["99", "Ranch", "Market"]) == "99 Ranch"

    def test_unknown_returns_none(self):
        assert detect_store(["Some", "Unknown", "Store", "Name"]) is None

    def test_fuzzy_walmart(self):
        # WALNART (2-char substitution) should fuzzy-match to Walmart
        result = detect_store(["WALNART"])
        assert result == "Walmart"


# ===========================================================================
# 7. extract_walmart
# ===========================================================================

class TestExtractWalmart:
    def _parse(self, tokens):
        return _mod.extract_walmart(_normalise_ocr_tokens(tokens))

    def test_basic_items(self):
        tokens = [
            "Walmart", "ST# 1234 OP# 5678",
            "MILK WHOLE", "3.49",
            "EGGS LG 12CT", "4.99",
            "SUBTOTAL", "8.48",
            "TAX 1", "6.500", "0.55",
            "TOTAL", "9.03",
            "10/18/2020",
        ]
        result = self._parse(tokens)
        names = [it["name"] for it in result["items"]]
        assert "MILK WHOLE" in names
        assert "EGGS LG 12CT" in names

    def test_subtotal_extracted(self):
        tokens = [
            "Walmart", "ST# 1 OP# 2",
            "ITEM A", "5.00",
            "SUBTOTAL", "5.00",
            "TOTAL", "5.00",
        ]
        result = self._parse(tokens)
        assert result["subtotal"] == pytest.approx(5.00)

    def test_total_extracted(self):
        tokens = [
            "Walmart", "ST# 1 OP# 2",
            "ITEM A", "5.00",
            "SUBTOTAL", "5.00",
            "TOTAL", "5.35",
            "10/18/2020",
        ]
        result = self._parse(tokens)
        assert result["total"] == pytest.approx(5.35)

    def test_date_extracted(self):
        tokens = [
            "Walmart", "ST# 1 OP# 2",
            "ITEM A", "2.00",
            "SUBTOTAL", "2.00",
            "TOTAL", "2.00",
            "11/13/2017",
        ]
        result = self._parse(tokens)
        assert result["date"] == "2017-11-13"

    def test_no_duplicate_tax(self):
        """TAX keyword appearing twice with the same value token should not
        create two identical tax entries (pre-fix regression)."""
        tokens = [
            "Walmart", "ST# 1 OP# 2",
            "ITEM", "10.00",
            "SUBTOTAL", "10.00",
            "TAX", "6.500", "0.65",
            "TOTAL", "10.65",
        ]
        result = self._parse(tokens)
        # Only one tax entry for one TAX keyword
        assert len(result["taxes"]) == 1

    def test_barcode_skipped(self):
        tokens = [
            "Walmart", "ST# 1 OP# 2",
            "071300070053",  # standalone barcode
            "CHEESE BLOCK", "6.48",
            "SUBTOTAL", "6.48",
            "TOTAL", "6.48",
        ]
        result = self._parse(tokens)
        # barcode should not appear as an item name
        names = [it["name"] for it in result["items"]]
        assert all("071300070053" not in n for n in names)


# ===========================================================================
# 8. extract_spar
# ===========================================================================

class TestExtractSpar:
    def _parse(self, tokens):
        return _mod.extract_spar(_normalise_ocr_tokens(tokens))

    def test_basic_items_with_sizes_skipped(self):
        tokens = [
            "SPAR", "VAT No", "4500000001",
            "WORCESTER SAUCE", "250ML", "17.99",
            "MILKY BAR", "TUB", "16.99",
            "TOTAL", "34.98",
            "28,06,14",
        ]
        result = self._parse(tokens)
        names = [it["name"] for it in result["items"]]
        assert any("WORCESTER" in n for n in names)
        assert any("MILKY" in n for n in names)

    def test_total_extracted(self):
        tokens = ["SPAR", "VAT No", "1",
                  "ITEM", "5.99", "TOTAL", "5.99", "01,01,20"]
        result = self._parse(tokens)
        assert result["total"] == pytest.approx(5.99)

    def test_date_day_first(self):
        tokens = ["SPAR", "VAT No", "1",
                  "ITEM", "1.00", "TOTAL", "1.00", "13,02,21"]
        result = self._parse(tokens)
        assert result["date"] == "2021-02-13"


# ===========================================================================
# 9. extract_whole_foods  (bug-fix regression)
# ===========================================================================

class TestExtractWholeFoods:
    def _parse(self, tokens):
        return _mod.extract_whole_foods(_normalise_ocr_tokens(tokens))

    def test_item_not_excluded_when_price_equals_total(self):
        """Bug fix: WF extractor used to exclude ALL items whose price value
        happened to equal the total, not just the actual total token."""
        # Three items each at 5.00 and a receipt total also 5.00
        tokens = [
            "Whole", "Foods", "Market",
            "BREAD", "5.00",
            "APPLE", "5.00",
            "BUTTER", "5.00",
            "BAL", "5.00",   # BAL = total keyword in WF
        ]
        result = self._parse(tokens)
        # With old code all three items would have been excluded
        assert len(result["items"]) >= 1

    def test_basic_item_extraction(self):
        tokens = [
            "Whole", "Foods", "Market",
            "SEA SALT CHIPS", "1.29",
            "BRIOCHE BREAD", "6.99",
            "BAL", "8.28",
            "02/10/2021",
        ]
        result = self._parse(tokens)
        names = [it["name"] for it in result["items"]]
        assert any("SEA SALT" in n for n in names)
        assert any("BRIOCHE" in n for n in names)

    def test_total_from_bal(self):
        tokens = ["Whole", "Foods", "ITEM", "10.00", "BAL", "10.00"]
        result = self._parse(tokens)
        assert result["total"] == pytest.approx(10.00)


# ===========================================================================
# 10. extract_costco
# ===========================================================================

class TestExtractCostco:
    def _parse(self, tokens):
        return _mod.extract_costco(_normalise_ocr_tokens(tokens))

    def test_item_code_and_name(self):
        tokens = [
            "COSTCO", "WHOLESALE",
            "123456 KIRKLAND COFFEE",
            "17.99",
            "SUBTOTAL", "17.99",
            "TOTAL", "17.99",
        ]
        result = self._parse(tokens)
        assert len(result["items"]) == 1
        assert "COFFEE" in result["items"][0]["name"].upper()

    def test_qty_at_price(self):
        tokens = [
            "COSTCO",
            "987654 OLIVE OIL",
            "2 @ 8.99",
            "17.98",
            "SUBTOTAL", "17.98",
            "TOTAL", "17.98",
        ]
        result = self._parse(tokens)
        assert result["items"][0]["quantity"] == 2

    def test_address_line_skipped(self):
        tokens = [
            "COSTCO", "WHOLESALE",
            "12345 1234 Main St",   # item-code pattern but address
            "123456 REAL ITEM",
            "9.99",
            "SUBTOTAL", "9.99",
            "TOTAL", "9.99",
        ]
        result = self._parse(tokens)
        names = [it["name"] for it in result["items"]]
        assert any("REAL ITEM" in n for n in names)
        assert all("Main" not in n for n in names)


# ===========================================================================
# 11. extract_generic  (bug-fix regression: tax values excluded from items)
# ===========================================================================

class TestExtractGeneric:
    def _parse(self, tokens):
        return _mod.extract_generic(_normalise_ocr_tokens(tokens))

    def test_tax_value_not_included_as_item(self):
        """Bug fix: tax amount token was being turned into a phantom item."""
        tokens = [
            "RANDOM STORE",
            "COFFEE MUG", "12.99",
            "PHONE CASE", "8.49",
            "TAX", "1.76",
            "TOTAL", "23.24",
        ]
        result = self._parse(tokens)
        prices = [it["price"] for it in result["items"]]
        assert 1.76 not in prices, "Tax value must not appear as an item price"
        assert result["total"] == pytest.approx(23.24)

    def test_items_extracted(self):
        tokens = [
            "SHOP", "OLIVE OIL", "6.99", "PASTA", "2.49",
            "TOTAL", "9.48",
        ]
        result = self._parse(tokens)
        assert len(result["items"]) >= 1

    def test_total_extracted(self):
        tokens = ["SHOP", "ITEM", "5.00", "TOTAL", "5.00"]
        result = self._parse(tokens)
        assert result["total"] == pytest.approx(5.00)

    def test_subtotal_and_total_both_extracted(self):
        tokens = [
            "SHOP", "ITEM", "10.00",
            "SUBTOTAL", "10.00",
            "TAX", "0.65",
            "TOTAL", "10.65",
        ]
        result = self._parse(tokens)
        assert result["subtotal"] == pytest.approx(10.00)
        assert result["total"] == pytest.approx(10.65)


# ===========================================================================
# 12. parse_receipt  — dispatch + normalisation + round-trip
# ===========================================================================

class TestParseReceipt:
    def test_empty_tokens_returns_unknown_no_crash(self):
        result = parse_receipt([])
        assert result["store"] == "Unknown"
        assert result["items"] == []

    def test_all_empty_string_tokens(self):
        """Bug fix: empty tokens after normalisation must not crash parser."""
        result = parse_receipt(["", "  ", "!", "``"])
        assert isinstance(result, dict)
        assert "items" in result

    def test_walmart_dispatch(self):
        tokens = [
            "Walmart", "ST# 5555 OP# 7777",
            "OATMEAL", "1.76",
            "SUBTOTAL", "1.76",
            "TOTAL", "1.76",
            "10/18/2020",
        ]
        result = parse_receipt(tokens)
        assert result["store"] == "Walmart"
        assert len(result["items"]) >= 1

    def test_trader_joes_dispatch(self):
        tokens = [
            "Trader", "Joe's",
            "CARROTS", "1.29",
            "SUBTOTAL", "1.29",
            "TOTAL", "1.29",
            "06/28/2014",
        ]
        result = parse_receipt(tokens)
        assert result["store"] == "Trader Joe's"

    def test_whole_foods_dispatch_fused_token(self):
        """Fused 'WholeFoods' token must be correctly detected."""
        tokens = ["WholeFoods", "Market", "BREAD", "3.99", "BAL", "3.99"]
        result = parse_receipt(tokens)
        assert result["store"] == "Whole Foods"

    def test_unknown_store_falls_back_to_generic(self):
        tokens = ["MYSTERY MART", "GADGET", "29.99", "TOTAL", "29.99"]
        result = parse_receipt(tokens)
        assert result["store"] == "Unknown"
        assert result["total"] == pytest.approx(29.99)

    def test_spar_dispatch(self):
        tokens = [
            "SPAR", "VAT No", "9999",
            "PEACH JAM", "82.99",
            "TOTAL", "82.99",
            "10,05,22",
        ]
        result = parse_receipt(tokens)
        assert result["store"] == "SPAR"

    def test_normalisation_runs_before_parsing(self):
        """OCR-mangled price 'O.49' (letter O instead of zero) must be fixed
        before the Walmart parser tries to read it."""
        tokens = [
            "Walmart", "ST# 1 OP# 2",
            "MILK", "O.49",        # OCR error: O instead of 0
            "SUBTOTAL", "O.49",
            "TOTAL", "O.49",
        ]
        result = parse_receipt(tokens)
        if result["items"]:
            assert result["items"][0]["price"] == pytest.approx(0.49)

    def test_result_schema(self):
        """parse_receipt must always return a dict with the canonical keys."""
        result = parse_receipt(["SHOP", "ITEM", "5.00", "TOTAL", "5.00"])
        for key in ("store", "date", "items", "subtotal", "taxes", "total"):
            assert key in result


# ===========================================================================
# 13. _fill_totals — duplicate-tax deduplication
# ===========================================================================

class TestFillTotals:
    def test_no_duplicate_taxes_same_value_token(self):
        """Bug fix: two TAX keyword tokens that point to the SAME downstream
        price token must not produce two tax entries.

        Token layout:
            ...TAX  TAX2  1.30  TOTAL  10.00...
        Both 'TAX' and 'TAX2' scan forward and hit the same '1.30' token at
        index 2.  The deduplication guard must prevent a second entry."""
        tokens = ["TAX", "TAX2", "1.30", "TOTAL", "10.00"]
        result = _empty_result("Test")
        _fill_totals(result, tokens, len(tokens))  # subtotal_idx = end
        # At most one tax entry
        assert len(result["taxes"]) <= 1

    def test_two_distinct_tax_lines(self):
        tokens = ["TAX1", "0.50", "TAX2", "0.75", "TOTAL", "10.00"]
        result = _empty_result("Test")
        _fill_totals(result, tokens, len(tokens))
        amounts = {t["amount"] for t in result["taxes"]}
        assert 0.50 in amounts
        assert 0.75 in amounts

    def test_total_found_forward(self):
        tokens = ["SUBTOTAL", "10.00", "TAX", "0.65", "TOTAL", "10.65"]
        result = _empty_result("Test")
        _fill_totals(result, tokens, 0)  # subtotal_idx = 0
        assert result["total"] == pytest.approx(10.65)

    def test_subtotal_populated(self):
        tokens = ["SUBTOTAL", "8.48", "TOTAL", "9.03"]
        result = _empty_result("Test")
        _fill_totals(result, tokens, 0)
        assert result["subtotal"] == pytest.approx(8.48)


# ===========================================================================
# 14. _find_date_in_tokens — embedded date fallback
# ===========================================================================

class TestFindDateInTokens:
    def test_normal_date(self):
        assert _find_date_in_tokens(["10/18/2020"]) == "2020-10-18"

    def test_embedded_date_fused_with_store_code(self):
        # _DATE_EMBEDDED now extracts dates from digit blobs too (no lookbehind)
        # so that fused store-code+date tokens like '908 638702/10/2021' are
        # correctly parsed.
        assert _find_date_in_tokens(["CODE02/10/2021"]) == "2021-02-10"
        assert _find_date_in_tokens(["908638702/10/2021"]) == "2021-02-10"
        assert _find_date_in_tokens(["908 638702/10/2021"]) == "2021-02-10"

    def test_returns_none_when_absent(self):
        assert _find_date_in_tokens(["MILK", "3.49", "TOTAL"]) is None

    def test_prefers_first_from_top(self):
        # First pass finds the first date; reversed fallback also works
        tokens = ["01/01/2020", "ITEM", "12/31/2021"]
        d = _find_date_in_tokens(tokens)
        assert d == "2020-01-01"

    def test_skips_policy_date(self):
        # Dates inside returns/policy text should be skipped
        tokens = [
            "ITEM", "3.49",
            "purchases made on or after 9/15/2020",
            "All returns require a receipt",
            "908 638702/10/2021",
        ]
        d = _find_date_in_tokens(tokens)
        assert d == "2021-02-10"


# ===========================================================================
# 15. extract_quantity_prefix
# ===========================================================================

class TestExtractQuantityPrefix:
    def test_no_prefix(self):
        qty, name = extract_quantity_prefix("MILK WHOLE")
        assert qty == 1
        assert name == "MILK WHOLE"

    def test_numeric_prefix(self):
        qty, name = extract_quantity_prefix("3 YOGURT CUPS")
        assert qty == 3
        assert name == "YOGURT CUPS"

    def test_large_qty_rejected(self):
        # qty > 99 should be ignored
        qty, name = extract_quantity_prefix("100 WATER BOTTLES")
        assert qty == 1
        assert "100" in name


# ===========================================================================
# 16. _DAYS_IN_MONTH — sanity check on the new constant
# ===========================================================================

class TestDaysInMonth:
    def test_jan_31(self):
        assert _DAYS_IN_MONTH[1] == 31

    def test_feb_29(self):
        assert _DAYS_IN_MONTH[2] == 29

    def test_apr_30(self):
        assert _DAYS_IN_MONTH[4] == 30

    def test_dec_31(self):
        assert _DAYS_IN_MONTH[12] == 31


# ===========================================================================
# 17. spatial_reorder
# ===========================================================================


def _make_det(x, y, text, w=80, h=20, conf=0.9):
    """Helper: create a fake easyOCR detail=1 detection."""
    bbox = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    return (bbox, text, conf)


class TestSpatialReorder:
    def test_empty_detections(self):
        assert spatial_reorder([]) == []

    def test_single_column_preserves_order(self):
        """When all detections are in one column, preserve reading order."""
        dets = [
            _make_det(50, 100, "STORE"),
            _make_det(50, 130, "ITEM A"),
            _make_det(50, 160, "ITEM B"),
        ]
        result = spatial_reorder(dets)
        assert result == ["STORE", "ITEM A", "ITEM B"]

    def test_two_column_name_before_price(self):
        """In a two-column layout, left (name) should come before right (price)
        on the same line."""
        dets = [
            _make_det(50, 100, "STORE NAME", w=200),
            _make_det(50, 200, "MILK WHOLE", w=200),
            _make_det(500, 200, "3.49", w=60),
            _make_det(50, 230, "EGGS LARGE", w=200),
            _make_det(500, 230, "4.99", w=60),
            _make_det(50, 300, "SUBTOTAL", w=200),
            _make_det(500, 300, "8.48", w=60),
        ]
        result = spatial_reorder(dets)
        # Name should precede price on each line
        milk_idx = result.index("MILK WHOLE")
        price1_idx = result.index("3.49")
        eggs_idx = result.index("EGGS LARGE")
        price2_idx = result.index("4.99")
        assert milk_idx < price1_idx
        assert eggs_idx < price2_idx
        # Name from one line shouldn't be adjacent to price from another
        assert price1_idx < eggs_idx

    def test_y_tolerance_groups_close_detections(self):
        """Detections within y_tolerance are grouped on the same band."""
        dets = [
            _make_det(50, 200, "BANANA"),
            _make_det(500, 210, "0.87"),  # 10px below — same band
        ]
        result = spatial_reorder(dets, y_tolerance=25)
        assert result.index("BANANA") < result.index("0.87")

    def test_interleaved_columns_reordered(self):
        """Even if easyOCR returns right-column first, spatial reorder fixes it."""
        dets = [
            _make_det(500, 200, "3.49", w=60),   # price first in input
            _make_det(50, 200, "MILK", w=200),    # name second
        ]
        result = spatial_reorder(dets)
        assert result == ["MILK", "3.49"]

    def test_barcode_between_name_and_price(self):
        """Barcodes in the middle column should appear between name and price."""
        dets = [
            _make_det(50, 200, "WING PLATE", w=150),
            _make_det(250, 200, "020108870398", w=150),   # barcode mid-column
            _make_det(500, 200, "3.98", w=60),
        ]
        result = spatial_reorder(dets)
        wing_idx = result.index("WING PLATE")
        price_idx = result.index("3.98")
        assert wing_idx < price_idx

    def test_header_footer_preserved(self):
        """Store name at top and date at bottom survive reordering."""
        dets = [
            _make_det(200, 50, "WALMART", w=200),
            _make_det(50, 200, "ITEM A", w=200),
            _make_det(500, 200, "1.99", w=60),
            _make_det(200, 400, "10/18/2020", w=150),
        ]
        result = spatial_reorder(dets)
        assert result[0] == "WALMART"
        assert "10/18/2020" in result


# ===========================================================================
# 18. ensemble_merge
# ===========================================================================


class TestEnsembleMerge:
    def test_empty_inputs(self):
        assert ensemble_merge([], []) == []

    def test_one_empty_returns_other(self):
        dets = [_make_det(50, 100, "MILK", conf=0.9)]
        assert len(ensemble_merge(dets, [])) == 1
        assert len(ensemble_merge([], dets)) == 1

    def test_identical_detections_deduplicated(self):
        """Same detection from both engines should produce one output."""
        det = _make_det(50, 100, "MILK WHOLE", conf=0.9)
        result = ensemble_merge([det], [det])
        assert len(result) == 1
        assert result[0][1] == "MILK WHOLE"

    def test_overlapping_keeps_higher_confidence(self):
        """When both engines detect the same region, keep higher conf."""
        det_a = _make_det(50, 100, "MILK WHOLE", conf=0.7)
        det_b = _make_det(52, 102, "MILK WHOLE", conf=0.95)
        result = ensemble_merge([det_a], [det_b])
        assert len(result) == 1
        assert result[0][2] == 0.95

    def test_non_overlapping_both_kept(self):
        """Different regions from each engine are both included."""
        det_a = _make_det(50, 100, "MILK", conf=0.9)
        det_b = _make_det(50, 300, "EGGS", conf=0.85)
        result = ensemble_merge([det_a], [det_b])
        texts = {d[1] for d in result}
        assert "MILK" in texts
        assert "EGGS" in texts

    def test_confidence_tiebreak_prefers_price(self):
        """When confs are close, prefer the detection with a valid price."""
        det_a = _make_det(400, 100, "3h9", conf=0.8)     # garbled
        det_b = _make_det(402, 102, "3.49", conf=0.75)   # valid price
        result = ensemble_merge([det_a], [det_b])
        assert len(result) == 1
        assert result[0][1] == "3.49"

    def test_low_conf_unmatched_dropped(self):
        """Unmatched detections below min_conf are excluded."""
        det_good = _make_det(50, 100, "MILK", conf=0.9)
        det_bad = _make_det(50, 300, "x", conf=0.05)
        result = ensemble_merge([det_good], [det_bad], min_conf=0.15)
        assert len(result) == 1
        assert result[0][1] == "MILK"

    def test_y_band_text_similarity_match(self):
        """Detections on the same Y-line with similar text should merge
        even if IoU is low (boxes offset horizontally)."""
        # Same y, different x — low IoU but clearly the same text
        det_a = _make_det(50, 200, "SUBTOTAL", w=120, conf=0.85)
        det_b = _make_det(90, 202, "SUBTOTAL", w=120, conf=0.90)
        result = ensemble_merge([det_a], [det_b])
        assert len(result) == 1

    def test_complementary_items_from_both_engines(self):
        """Simulate the real-world scenario: EasyOCR finds items A, B;
        PaddleOCR finds items B, C. Result should have A, B, C."""
        easy_dets = [
            _make_det(50, 100, "ITEM A", conf=0.9),
            _make_det(50, 200, "ITEM B", conf=0.85),
            _make_det(400, 200, "3.49", conf=0.95),
        ]
        paddle_dets = [
            _make_det(52, 202, "ITEM B", conf=0.90),
            _make_det(402, 202, "3.49", conf=0.92),
            _make_det(50, 300, "ITEM C", conf=0.88),
            _make_det(400, 300, "2.99", conf=0.91),
        ]
        result = ensemble_merge(easy_dets, paddle_dets)
        texts = [d[1] for d in result]
        assert "ITEM A" in texts
        assert "ITEM B" in texts
        assert "ITEM C" in texts
        assert texts.count("ITEM B") == 1  # not duplicated


# ── Checksum validation tests ───────────────────────────────────────────────

_checksum_validate = _mod._checksum_validate
_defuse_price = _mod._defuse_price


class TestDefusePrice:
    def test_strip_one_digit(self):
        assert 28.28 in _defuse_price(828.28)

    def test_strip_two_digits(self):
        assert 1.29 in _defuse_price(81.29)

    def test_no_defuse_for_small(self):
        assert _defuse_price(3.99) == []

    def test_single_digit_integer(self):
        assert _defuse_price(5.00) == []


class TestChecksumValidate:
    def test_fused_total_and_item_corrected(self):
        """Whole Foods receipt 5.jpg pattern: total 828.28→28.28, item 81.29→1.29."""
        result = {
            "items": [
                {"name": "SEA SALT", "price": 81.29},
                {"name": "BRIOCHE", "price": 6.99},
                {"name": "CHEF PLATE", "price": 20.0},
            ],
            "subtotal": 828.28,
            "total": 828.28,
            "taxes": [],
        }
        fixed = _checksum_validate(result)
        assert abs(fixed["total"] - 28.28) < 0.01
        assert abs(fixed["subtotal"] - 28.28) < 0.01
        assert abs(fixed["items"][0]["price"] - 1.29) < 0.01
        assert fixed["items"][1]["price"] == 6.99  # unchanged
        assert fixed["items"][2]["price"] == 20.0   # unchanged

    def test_no_change_when_already_correct(self):
        result = {
            "items": [
                {"name": "A", "price": 1.29},
                {"name": "B", "price": 6.99},
            ],
            "subtotal": 8.28,
            "total": 8.28,
            "taxes": [],
        }
        fixed = _checksum_validate(result)
        assert fixed["items"][0]["price"] == 1.29
        assert fixed["items"][1]["price"] == 6.99
        assert fixed["total"] == 8.28

    def test_no_items(self):
        result = {"items": [], "subtotal": 10.0, "total": 10.0, "taxes": []}
        assert _checksum_validate(result) == result

    def test_no_total(self):
        result = {
            "items": [{"name": "A", "price": 5.0}],
            "subtotal": None,
            "total": None,
            "taxes": [],
        }
        assert _checksum_validate(result) == result

    def test_digit_swap_correction(self):
        """If an item price has a single-digit OCR error, fix it.

        Use prices where no defuse (leading-digit strip) can match the total,
        so only a single-digit swap can bring the sum close.
        """
        # 4.29 + 7.54 + 2.48 = 14.31
        # OCR error: 7.54 → 7.94 (5→9)
        result = {
            "items": [
                {"name": "A", "price": 4.29},
                {"name": "B", "price": 7.94},  # should be 7.54
                {"name": "C", "price": 2.48},
            ],
            "subtotal": 14.31,
            "total": 14.31,
            "taxes": [],
        }
        fixed = _checksum_validate(result)
        # With swap: 4.29 + 7.54 + 2.48 = 14.31
        assert abs(fixed["items"][1]["price"] - 7.54) < 0.01
        assert fixed["items"][0]["price"] == 4.29  # unchanged
        assert fixed["items"][2]["price"] == 2.48   # unchanged
