"""Name normalization between human/canonical ingredient names and Epicure tokens.

Epicure vocabulary tokens are lowercase snake_case (e.g. ``black_pepper``,
``chicken_broth``). The app stores ingredients as display/canonical names with
spaces and mixed case. These helpers translate between the two representations
and resolve a free-text name against a model's vocabulary with light fallbacks.
"""
from __future__ import annotations

import re
import unicodedata

__all__ = ["to_token", "from_token", "resolve_token"]


def to_token(name: str) -> str:
    """Normalize a display/canonical ingredient name to an Epicure token.

    Lowercases, strips accents and punctuation, and collapses any run of
    spaces or hyphens into single underscores. Returns "" for blank input.
    """
    if not name or not name.strip():
        return ""
    # Strip accents/diacritics (Crème -> Creme)
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    lowered = ascii_only.lower()
    # Replace any non-alphanumeric character with a space, then collapse to underscores
    cleaned = re.sub(r"[^a-z0-9]+", " ", lowered).strip()
    return re.sub(r"\s+", "_", cleaned)


def from_token(token: str) -> str:
    """Convert an Epicure token back to a human-readable display name."""
    return token.replace("_", " ").strip()


def resolve_token(name: str, vocab: dict[str, int]) -> str | None:
    """Resolve a free-text ingredient name to a token present in ``vocab``.

    Tries the exact normalized token first, then a small set of singular/plural
    fallbacks. Returns None when no candidate exists in the vocabulary.
    """
    token = to_token(name)
    if not token:
        return None
    if token in vocab:
        return token

    for candidate in _morphological_candidates(token):
        if candidate in vocab:
            return candidate
    return None


def _morphological_candidates(token: str) -> list[str]:
    """Generate one singular/plural variant to try when the exact token is absent.

    The rules are mutually exclusive (most specific wins) so we never emit
    spurious stems like "berrie"/"tomatoe" that can only ever miss.
    """
    if token.endswith("ies") and len(token) > 3:
        return [token[:-3] + "y"]  # berries -> berry
    if token.endswith("es") and len(token) > 2:
        return [token[:-2]]  # tomatoes -> tomato
    if token.endswith("s") and len(token) > 1:
        return [token[:-1]]  # eggs -> egg
    return [token + "s"]  # egg -> eggs
