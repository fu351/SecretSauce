"""
recipe_dictionary.py
====================
Cooking-domain dictionary for post-OCR name correction.

Mirrors receipt_dictionary.py but with ~400 cooking-specific terms covering
ingredients, techniques, equipment, and common recipe vocabulary.

Dependencies: stdlib only (difflib).
"""
from __future__ import annotations

import difflib

# ── Cooking ingredients ────────────────────────────────────────────────────
# Broader than receipt_dictionary.py's ~200 grocery terms — includes
# preparation adjectives, ethnic ingredients, and baking specifics.

COOKING_TERMS: frozenset[str] = frozenset({
    # ── Produce ────────────────────────────────────────────────────────────
    "APPLE", "APPLES", "ARTICHOKE", "ARUGULA", "ASPARAGUS", "AVOCADO",
    "BANANA", "BASIL", "BEET", "BEETS", "BELL", "BLUEBERRY", "BLUEBERRIES",
    "BROCCOLI", "BRUSSELS", "CABBAGE", "CANTALOUPE", "CARROT", "CARROTS",
    "CAULIFLOWER", "CELERY", "CHERRY", "CHERRIES", "CHILI", "CHIVE",
    "CHIVES", "CILANTRO", "CORN", "CRANBERRY", "CRANBERRIES", "CUCUMBER",
    "DILL", "EGGPLANT", "ENDIVE", "FENNEL", "GARLIC", "GINGER", "GRAPE",
    "GRAPES", "HABANERO", "JALAPENO", "KALE", "KOHLRABI", "LEEK", "LEEKS",
    "LEMON", "LEMONS", "LEMONGRASS", "LETTUCE", "LIME", "LIMES", "MANGO",
    "MANGOES", "MINT", "MUSHROOM", "MUSHROOMS", "OKRA", "OLIVE", "OLIVES",
    "ONION", "ONIONS", "ORANGE", "ORANGES", "OREGANO", "PARSLEY", "PARSNIP",
    "PEACH", "PEACHES", "PEAR", "PEARS", "PEPPER", "PEPPERS", "PINEAPPLE",
    "PLANTAIN", "PLUM", "POTATO", "POTATOES", "PUMPKIN", "RADICCHIO",
    "RADISH", "RASPBERRY", "RASPBERRIES", "RHUBARB", "ROMAINE", "ROSEMARY",
    "SAGE", "SCALLION", "SCALLIONS", "SHALLOT", "SHALLOTS", "SPINACH",
    "SPROUTS", "SQUASH", "STRAWBERRY", "STRAWBERRIES", "SWEET", "TARRAGON",
    "THYME", "TOMATILLO", "TOMATO", "TOMATOES", "TURNIP", "WATERCRESS",
    "WATERMELON", "ZUCCHINI",

    # ── Dairy & eggs ───────────────────────────────────────────────────────
    "BUTTER", "BUTTERMILK", "CHEESE", "CHEDDAR", "COLBY", "COTTAGE",
    "CREAM", "CREME", "EGGS", "FETA", "GOUDA", "GRUYERE", "MASCARPONE",
    "MILK", "MONTEREY", "MOZZARELLA", "MUENSTER", "PARMESAN", "PECORINO",
    "PROVOLONE", "QUESO", "RICOTTA", "SOUR", "SWISS", "WHEY", "YOGURT",

    # ── Meat & seafood ─────────────────────────────────────────────────────
    "ANCHOVY", "ANCHOVIES", "BACON", "BEEF", "BRISKET", "CALAMARI",
    "CHICKEN", "CHORIZO", "CLAM", "CLAMS", "CRAB", "DUCK", "DRUMSTICK",
    "FILET", "FISH", "GOAT", "GROUND", "HAM", "HALIBUT", "LAMB", "LOBSTER",
    "MUSSEL", "MUSSELS", "OCTOPUS", "OYSTER", "OYSTERS", "PANCETTA",
    "PORK", "PRAWN", "PRAWNS", "PROSCIUTTO", "QUAIL", "RABBIT", "RIBEYE",
    "SALMON", "SARDINE", "SARDINES", "SAUSAGE", "SCALLOP", "SCALLOPS",
    "SHRIMP", "SIRLOIN", "SNAPPER", "SQUID", "STEAK", "SWORDFISH",
    "TENDERLOIN", "THIGH", "TILAPIA", "TROUT", "TUNA", "TURKEY",
    "VEAL", "VENISON", "WING", "WINGS",

    # ── Bakery & grains ────────────────────────────────────────────────────
    "BAGEL", "BAGUETTE", "BARLEY", "BREAD", "BRIOCHE", "BUCKWHEAT",
    "BULGUR", "BUN", "BUNS", "CIABATTA", "CORNBREAD", "CORNMEAL",
    "COUSCOUS", "CRACKER", "CRACKERS", "CROUTON", "CROUTONS", "CROISSANT",
    "FARRO", "FLATBREAD", "FLOUR", "FOCACCIA", "GNOCCHI", "GRANOLA",
    "GRITS", "LASAGNA", "LINGUINE", "MACARONI", "MUFFIN", "NAAN",
    "NOODLES", "OATMEAL", "OATS", "ORZO", "PANCAKE", "PAPPARDELLE",
    "PASTA", "PENNE", "PHYLLO", "PITA", "POLENTA", "QUINOA", "RICE",
    "RIGATONI", "RISOTTO", "ROLL", "ROLLS", "ROTINI", "RYE",
    "SEMOLINA", "SOURDOUGH", "SPAGHETTI", "TAGLIATELLE", "TORTILLA",
    "TORTILLAS", "UDON", "VERMICELLI", "WAFFLE", "WHEAT",

    # ── Pantry / condiments ────────────────────────────────────────────────
    "ALMOND", "ALMONDS", "BALSAMIC", "BOUILLON", "BROTH", "CAPERS",
    "CASHEW", "CASHEWS", "CAYENNE", "CHUTNEY", "CINNAMON", "CLOVE",
    "CLOVES", "COCOA", "COCONUT", "CORNSTARCH", "CUMIN", "CURRY",
    "DIJON", "EXTRACT", "GARAM", "HARISSA", "HAZELNUT", "HONEY",
    "HORSERADISH", "HOISIN", "HUMMUS", "JELLY", "KETCHUP", "MAPLE",
    "MARINARA", "MARJORAM", "MASALA", "MAYO", "MAYONNAISE", "MIRIN",
    "MISO", "MOLASSES", "MUSTARD", "NUTMEG", "NUTRITIONAL",
    "OIL", "OLIVE", "PAPRIKA", "PECAN", "PECANS", "PEPPERCORN",
    "PESTO", "PISTACHIO", "PISTACHIOS", "POPPY", "RELISH",
    "RICE", "SAFFRON", "SALSA", "SALT", "SAUCE", "SESAME",
    "SOY", "SRIRACHA", "STOCK", "SUGAR", "SUMAC", "SYRUP",
    "TABASCO", "TAHINI", "TAMARI", "TAMARIND", "TERIYAKI",
    "TOMATO", "TURMERIC", "VANILLA", "VINEGAR", "WALNUT", "WALNUTS",
    "WASABI", "WORCESTERSHIRE", "YEAST",

    # ── Baking specifics ───────────────────────────────────────────────────
    "BAKING", "BICARBONATE", "CHOCOLATE", "CONFECTIONERS", "CREAM",
    "FONDANT", "FROSTING", "GANACHE", "GELATIN", "GLAZE", "ICING",
    "MARSHMALLOW", "MERINGUE", "POWDERED", "SHORTENING", "SPRINKLES",

    # ── Cooking verbs / adjectives (for OCR correction) ────────────────────
    "BASTE", "BLANCH", "BLEND", "BOIL", "BRAISE", "BREAD", "BROIL",
    "BROWN", "CARAMELIZE", "CHIFFONADE", "CHOP", "CHOPPED", "COMBINE",
    "COOKED", "CREAM", "CRUSH", "CRUSHED", "CUBE", "CUBED", "DEGLAZE",
    "DICE", "DICED", "DRAIN", "DRAINED", "DRIZZLE", "DRIED", "EMULSIFY",
    "FLAKE", "FLAKED", "FOLD", "FRESH", "FRIED", "FRY", "GARNISH",
    "GLAZE", "GRATE", "GRATED", "GRILL", "GRILLED", "HALVED", "JULIENNE",
    "KNEAD", "MARINATE", "MARINATED", "MASH", "MASHED", "MELT", "MELTED",
    "MINCE", "MINCED", "PEEL", "PEELED", "POACH", "POUND", "PREHEAT",
    "PUREE", "REDUCE", "ROAST", "ROASTED", "SAUTE", "SAUTEED",
    "SCRAMBLE", "SEAR", "SEASON", "SHRED", "SHREDDED", "SIFT", "SIMMER",
    "SLICE", "SLICED", "SMOKE", "SMOKED", "SOFTENED", "STEAM", "STEW",
    "STIR", "STRAIN", "STUFF", "TENDER", "TOAST", "TOASTED", "TOSS",
    "TRIM", "TRIMMED", "WARM", "WHIP", "WHISK", "WHOLE",

    # ── Descriptors common on recipe cards ─────────────────────────────────
    "BONELESS", "COARSE", "COLD", "CONDENSED", "DARK", "DRY",
    "EVAPORATED", "EXTRA", "FINE", "FIRM", "FLAT", "FROZEN",
    "GOLDEN", "HEAVY", "HOT", "ITALIAN", "LARGE", "LEAN", "LIGHT",
    "LOW", "MEDIUM", "NATURAL", "ORGANIC", "PACKED", "PLAIN",
    "RAW", "REGULAR", "RIPE", "ROOM", "SEEDLESS", "SKINLESS",
    "SMALL", "SMOKED", "TEMPERATURE", "THICK", "THIN", "UNSALTED",
    "VIRGIN", "WARM", "WHITE",
})


def correct_ingredient_name(name: str, cutoff: float = 0.78) -> str:
    """Fuzzy-correct each word in an ingredient name against the cooking dictionary.

    Mirrors receipt_dictionary.correct_item_name() but uses the broader
    cooking vocabulary and a slightly lower cutoff (0.78 vs 0.80) because
    handwritten recipe OCR tends to be noisier than printed receipts.

    Parameters
    ----------
    name : str
        Raw ingredient name from OCR extraction.
    cutoff : float
        Minimum similarity ratio (0.0–1.0). Default 0.78.

    Returns
    -------
    str
        Corrected ingredient name (preserves original casing).
    """
    words = name.split()
    corrected: list[str] = []
    for word in words:
        upper = word.upper()
        # Skip short words and already-correct ones
        if len(upper) < 4 or upper in COOKING_TERMS:
            corrected.append(word)
            continue
        matches = difflib.get_close_matches(
            upper, COOKING_TERMS, n=1, cutoff=cutoff,
        )
        if matches:
            # Preserve original casing style
            if word.isupper():
                corrected.append(matches[0])
            elif word.istitle():
                corrected.append(matches[0].title())
            else:
                corrected.append(matches[0].lower())
        else:
            corrected.append(word)
    return " ".join(corrected)
