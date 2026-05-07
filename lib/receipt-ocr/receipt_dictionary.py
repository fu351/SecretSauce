"""
receipt_dictionary.py
=====================
Receipt-domain dictionary for post-OCR name correction.

Contains ~200 common grocery/retail terms.  After item extraction,
``correct_item_name()`` fuzzy-matches each word against the dictionary
to fix OCR typos like "BNANAS" -> "BANANAS".

Dependencies: stdlib only (difflib).
"""
from __future__ import annotations

import difflib
from pathlib import Path

# ── Common grocery / retail terms ───────────────────────────────────────────
# Kept as a flat frozenset for O(1) membership checks and fast fuzzy search.

_CORU_VOCAB_PATH = (
    Path(__file__).resolve().parent / "test" / "datasets" / "coru" / "grocery_vocab.txt"
)

# Synced from Supabase ``standardized_ingredients`` by sync_dictionary.py.
# Optional — if the file is missing the dictionary still works using just
# the in-code builtins + COR-U vocab. See sync_dictionary.py for refresh.
_STANDARDIZED_VOCAB_PATH = (
    Path(__file__).resolve().parent / "standardized_vocab.txt"
)


def _load_coru_vocab() -> set[str]:
    if not _CORU_VOCAB_PATH.exists():
        return set()
    return {line.strip() for line in _CORU_VOCAB_PATH.read_text().splitlines() if line.strip()}


def _load_standardized_vocab() -> set[str]:
    """Load the Supabase-synced canonical vocabulary if present."""
    if not _STANDARDIZED_VOCAB_PATH.exists():
        return set()
    return {
        line.strip().upper()
        for line in _STANDARDIZED_VOCAB_PATH.read_text().splitlines()
        if line.strip() and line.strip().isascii()
    }


_BUILTIN_TERMS: set[str] = {
    # Produce
    "APPLE", "APPLES", "AVOCADO", "AVOCADOS", "BANANA", "BANANAS",
    "BLUEBERRY", "BLUEBERRIES", "BROCCOLI", "CABBAGE", "CANTALOUPE",
    "CARROT", "CARROTS", "CELERY", "CHERRY", "CHERRIES", "CILANTRO",
    "CORN", "CUCUMBER", "CUCUMBERS", "GARLIC", "GINGER", "GRAPE",
    "GRAPES", "GREEN", "JALAPENO", "KALE", "LEMON", "LEMONS", "LETTUCE",
    "LIME", "LIMES", "MANGO", "MANGOES", "MELON", "MUSHROOM", "MUSHROOMS",
    "ONION", "ONIONS", "ORANGE", "ORANGES", "PARSLEY", "PEACH", "PEACHES",
    "PEAR", "PEARS", "PEPPER", "PEPPERS", "PINEAPPLE", "PLUM", "POTATO",
    "POTATOES", "RADISH", "RASPBERRY", "RASPBERRIES", "ROMAINE",
    "SPINACH", "SQUASH", "STRAWBERRY", "STRAWBERRIES", "TOMATO",
    "TOMATOES", "WATERMELON", "ZUCCHINI",
    # Dairy & eggs
    "BUTTER", "CHEESE", "COTTAGE", "CREAM", "EGGS", "MILK", "MOZZARELLA",
    "PARMESAN", "SOUR", "YOGURT",
    # Meat & seafood
    "BACON", "BEEF", "CHICKEN", "DRUMSTICK", "FISH", "GROUND", "HAM",
    "LAMB", "PORK", "SALMON", "SAUSAGE", "SHRIMP", "STEAK", "THIGH",
    "TURKEY", "WING", "WINGS",
    # Bakery
    "BAGEL", "BAGELS", "BREAD", "BRIOCHE", "BUN", "BUNS", "CAKE",
    "COOKIE", "COOKIES", "CROISSANT", "DONUT", "DONUTS", "MUFFIN",
    "MUFFINS", "ROLL", "ROLLS", "TORTILLA", "TORTILLAS",
    # Pantry
    "BEANS", "CEREAL", "CHIPS", "COFFEE", "CRACKERS", "FLOUR",
    "GRANOLA", "HONEY", "JAM", "JELLY", "KETCHUP", "MAYO", "MUSTARD",
    "NOODLES", "OATMEAL", "OIL", "OLIVE", "PASTA", "PEANUT", "RICE",
    "RITZ", "SALSA", "SAUCE", "SOUP", "SUGAR", "SYRUP", "VINEGAR",
    # Beverages
    "BEER", "COCONUT", "COKE", "JUICE", "LEMONADE", "PEPSI",
    "SODA", "SPARKLING", "TEA", "WATER", "WINE",
    # Frozen
    "FROZEN", "ICE", "PIZZA", "WAFFLES",
    # Snacks
    "ALMONDS", "CASHEWS", "CHOCOLATE", "CANDY", "NUTS", "PEANUTS",
    "POPCORN", "PRETZELS", "TRAIL",
    # Household
    "BATTERY", "BATTERIES", "BLEACH", "DETERGENT", "NAPKIN", "NAPKINS",
    "PAPER", "TISSUE", "TOWEL", "TOWELS", "TRASH", "WRAP",
    # Personal care
    "DEODORANT", "LOTION", "SHAMPOO", "SOAP", "TOOTHBRUSH", "TOOTHPASTE",
    # General receipt terms
    "ORGANIC", "WHOLE", "FRESH", "NATURAL", "REGULAR", "LARGE", "SMALL",
    "MEDIUM", "LITE", "LIGHT", "FREE", "RANGE", "BRAND", "PREMIUM",
    "VALUE", "PACK", "FAMILY", "BONELESS", "SKINLESS", "SEEDLESS",
    "ROASTED", "SALTED", "UNSALTED", "ORIGINAL", "VANILLA", "PLAIN",
}

GROCERY_TERMS: frozenset[str] = frozenset(
    _BUILTIN_TERMS | _load_coru_vocab() | _load_standardized_vocab()
)


def correct_item_name(name: str, cutoff: float = 0.80) -> str:
    """Fuzzy-correct each word in an item name against the grocery dictionary.

    Parameters
    ----------
    name : str
        Raw item name from OCR extraction.
    cutoff : float
        Minimum similarity ratio for a correction (0.0–1.0).
        Default 0.80 is conservative: fixes 1-char errors in 5+ char words.

    Returns
    -------
    str
        Corrected item name (uppercase).
    """
    words = name.upper().split()
    corrected: list[str] = []
    for word in words:
        # Skip short words (prepositions, codes) and already-correct words
        if len(word) < 4 or word in GROCERY_TERMS:
            corrected.append(word)
            continue
        matches = difflib.get_close_matches(
            word, GROCERY_TERMS, n=1, cutoff=cutoff,
        )
        corrected.append(matches[0] if matches else word)
    return ' '.join(corrected)
