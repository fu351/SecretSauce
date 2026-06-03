"""RED tests for the epicure -> Supabase ingredient_swaps export (pure logic)."""
from types import SimpleNamespace

import pytest

import export_ingredient_swaps as exp
from export_ingredient_swaps import (
    _chunk,
    _create_supabase,
    _fetch_standardized_ingredients,
    _model_version_label,
    build_name_to_id,
    build_swap_rows,
)


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


class TestHelpers:
    def test_chunk_splits_into_size_batches(self):
        assert list(_chunk([1, 2, 3, 4, 5], 2)) == [[1, 2], [3, 4], [5]]

    def test_model_version_label_uses_pinned_shas(self):
        label = _model_version_label()
        assert label.startswith("core@")
        assert "+chem@" in label

    def test_create_supabase_raises_without_credentials(self, monkeypatch):
        for var in ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
            monkeypatch.delenv(var, raising=False)
        with pytest.raises(RuntimeError):
            _create_supabase()


class TestFetchStandardizedIngredients:
    def test_pages_until_a_short_batch(self):
        rows = [{"id": str(i), "canonical_name": f"ing {i}"} for i in range(1500)]

        class FakeQuery:
            def __init__(self, data):
                self._data = data

            def select(self, *_a, **_k):
                return self

            def range(self, start, end):
                self._slice = self._data[start : end + 1]
                return self

            def execute(self):
                return SimpleNamespace(data=self._slice)

        class FakeClient:
            def __init__(self, data):
                self._data = data

            def table(self, _name):
                return FakeQuery(self._data)

        result = _fetch_standardized_ingredients(FakeClient(rows))
        assert len(result) == 1500

    def test_create_supabase_returns_client_with_creds(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "http://example.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
        import supabase as sb

        monkeypatch.setattr(sb, "create_client", lambda url, key: ("client", url, key))
        client = _create_supabase()
        assert client[0] == "client"


class _MainFakeService:
    def tokens(self, model="core"):
        return ["chicken", "butter"]

    def swap(self, token, k=8):
        return [{"ingredient": "turkey", "token": "turkey", "score": 1.0}]


class TestMain:
    def _patch_seams(self, monkeypatch, supabase_client):
        monkeypatch.setattr(exp, "load_default", lambda *_a, **_k: _MainFakeService())
        monkeypatch.setattr(exp, "_create_supabase", lambda: supabase_client)
        monkeypatch.setattr(
            exp,
            "_fetch_standardized_ingredients",
            lambda _c: [
                {"id": "id-chicken", "canonical_name": "chicken"},
                {"id": "id-turkey", "canonical_name": "turkey"},
            ],
        )

    def test_dry_run_writes_nothing_and_returns_zero(self, monkeypatch):
        self._patch_seams(monkeypatch, supabase_client=object())
        assert exp.main(["--dry-run", "--limit", "2"]) == 0

    def test_full_run_upserts_rows(self, monkeypatch):
        captured = []

        class FakeTable:
            def upsert(self, rows, on_conflict=None):
                captured.append(rows)
                return self

            def execute(self):
                return None

        class FakeClient:
            def table(self, _name):
                return FakeTable()

        self._patch_seams(monkeypatch, supabase_client=FakeClient())
        assert exp.main([]) == 0
        assert sum(len(batch) for batch in captured) >= 1

    def test_full_run_stamps_updated_at_on_every_row(self, monkeypatch):
        captured = []

        class FakeTable:
            def upsert(self, rows, on_conflict=None):
                captured.extend(rows)
                return self

            def execute(self):
                return None

        class FakeClient:
            def table(self, _name):
                return FakeTable()

        self._patch_seams(monkeypatch, supabase_client=FakeClient())
        assert exp.main([]) == 0
        assert captured, "expected at least one upserted row"
        assert all("updated_at" in row for row in captured)

    def test_main_returns_nonzero_when_an_upsert_batch_fails(self, monkeypatch):
        """Regression: an unguarded upsert raised out of main(), leaving a partial
        write with no failure signal. A batch failure must return a non-zero code."""

        class FailingTable:
            def upsert(self, rows, on_conflict=None):
                return self

            def execute(self):
                raise RuntimeError("db connection reset")

        class FailingClient:
            def table(self, _name):
                return FailingTable()

        self._patch_seams(monkeypatch, supabase_client=FailingClient())
        assert exp.main([]) == 1
