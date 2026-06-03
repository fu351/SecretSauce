"""RED tests for epicure name normalization (pure functions)."""
import pytest

from epicure_names import from_token, resolve_token, to_token


class TestToToken:
    def test_lowercases_and_underscores_spaces(self):
        assert to_token("Black Pepper") == "black_pepper"

    def test_collapses_hyphens_and_extra_spaces(self):
        assert to_token("  Extra-Virgin   Olive  Oil ") == "extra_virgin_olive_oil"

    def test_strips_punctuation(self):
        assert to_token("Crème Fraîche!") == "creme_fraiche"

    def test_empty_string_returns_empty(self):
        assert to_token("") == ""
        assert to_token("   ") == ""


class TestFromToken:
    def test_converts_underscores_to_spaces(self):
        assert from_token("chicken_broth") == "chicken broth"

    def test_roundtrips_simple_names(self):
        assert from_token(to_token("Olive Oil")) == "olive oil"


class TestResolveToken:
    def test_exact_token_match(self):
        vocab = {"black_pepper": 0, "chicken": 1}
        assert resolve_token("Black Pepper", vocab) == "black_pepper"

    def test_returns_none_when_absent(self):
        vocab = {"chicken": 0}
        assert resolve_token("dragonfruit", vocab) is None

    def test_falls_back_to_singular_when_plural_absent(self):
        vocab = {"egg": 0}
        assert resolve_token("eggs", vocab) == "egg"

    def test_prefers_exact_plural_over_singular_fallback(self):
        vocab = {"oats": 0, "oat": 1}
        assert resolve_token("oats", vocab) == "oats"
