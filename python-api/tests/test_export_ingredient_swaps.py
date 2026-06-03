"""RED tests for the epicure -> Supabase ingredient_swaps export (pure logic)."""
import pytest

from export_ingredient_swaps import build_name_to_id, build_swap_rows


class FakeSwapService:
    """Minimal stand-in exposing the EpicureService.swap shape used by the export."""

    def __init__(self, mapping):
        self._m = mapping

    def swap(self, ingredient, k=8):
        return list(self._m.get(ingredient, []))[:k]


class TestBuildNameToId:
    def test_tokenizes_canonical_names_to_epicure_token_space(self):
        rows = [
            {"id": "1", "canonical_name": "black pepper"},
            {"id": "2", "canonical_name": "Olive Oil"},
        ]
        mapping = build_name_to_id(rows)
        assert mapping["black_pepper"] == "1"
        assert mapping["olive_oil"] == "2"

    def test_skips_blank_canonical_names(self):
        rows = [{"id": "1", "canonical_name": ""}, {"id": "2", "canonical_name": "  "}]
        assert build_name_to_id(rows) == {}


class TestBuildSwapRows:
    def test_maps_ids_ranks_and_keeps_unmapped_swap_as_null(self):
        svc = FakeSwapService(
            {
                "chicken": [
                    {"ingredient": "turkey", "token": "turkey", "score": 1.05, "sources": ["core", "chem"]},
                    {"ingredient": "pork", "token": "pork", "score": 0.98, "sources": ["core"]},
                ]
            }
        )
        # pork intentionally has no standardized id
        name_to_id = {"chicken": "id-chicken", "turkey": "id-turkey"}

        rows = build_swap_rows(svc, name_to_id, ["chicken", "unmapped_source"], k=8, model_version="core+chem")

        assert len(rows) == 2
        assert rows[0] == {
            "standardized_ingredient_id": "id-chicken",
            "swap_standardized_ingredient_id": "id-turkey",
            "swap_token": "turkey",
            "swap_display_name": "turkey",
            "score": 1.05,
            "rank": 1,
            "source": "epicure",
            "model_version": "core+chem",
        }
        # pork is unmapped -> swap_standardized_ingredient_id is None, rank continues
        assert rows[1]["swap_token"] == "pork"
        assert rows[1]["swap_standardized_ingredient_id"] is None
        assert rows[1]["rank"] == 2

    def test_skips_source_tokens_without_a_standardized_id(self):
        svc = FakeSwapService({"chicken": [{"ingredient": "pork", "token": "pork", "score": 0.5}]})
        # "chicken" not in the map -> the whole source is skipped
        rows = build_swap_rows(svc, {"pork": "id-pork"}, ["chicken"], k=8)
        assert rows == []

    def test_respects_k(self):
        svc = FakeSwapService(
            {"chicken": [{"ingredient": f"s{i}", "token": f"s{i}", "score": 1.0 - i / 10} for i in range(10)]}
        )
        name_to_id = {"chicken": "id-c"}
        rows = build_swap_rows(svc, name_to_id, ["chicken"], k=3)
        assert len(rows) == 3
        assert [r["rank"] for r in rows] == [1, 2, 3]
