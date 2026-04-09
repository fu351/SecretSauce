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

# ── Common grocery / retail terms ───────────────────────────────────────────
# Kept as a flat frozenset for O(1) membership checks and fast fuzzy search.

GROCERY_TERMS: frozenset[str] = frozenset({
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
})


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
