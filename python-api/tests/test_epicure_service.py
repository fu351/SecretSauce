"""RED tests for EpicureService (model-backed business logic, fake model injected)."""
import pytest

from epicure_service import EpicureService


@pytest.fixture
def service(fake_core, fake_chem):
    return EpicureService(models={"core": fake_core, "chem": fake_chem})


class TestNeighbors:
    def test_returns_ranked_neighbours_with_display_names(self, service):
        results = service.neighbors("Chicken", k=2, model="core")
        assert [r["ingredient"] for r in results] == ["pork", "beef"]
        assert results[0]["token"] == "pork"
        assert results[0]["score"] == pytest.approx(0.58)

    def test_unknown_ingredient_returns_empty(self, service):
        assert service.neighbors("dragonfruit", model="core") == []

    def test_unknown_model_raises_value_error(self, service):
        with pytest.raises(ValueError):
            service.neighbors("chicken", model="nope")


class TestSwap:
    def test_blends_core_and_chem_scores(self, service):
        # turkey: 0.35(core)+0.70(chem)=1.05 ranks above pork: 0.58+0.40=0.98
        results = service.swap("chicken", k=5)
        tokens = [r["token"] for r in results]
        assert tokens[0] == "turkey"
        assert tokens[1] == "pork"
        assert results[0]["score"] == pytest.approx(1.05)

    def test_swap_records_contributing_sources(self, service):
        results = service.swap("chicken", k=5)
        by_token = {r["token"]: r for r in results}
        assert set(by_token["turkey"]["sources"]) == {"core", "chem"}
        assert by_token["beef"]["sources"] == ["core"]  # only in core

    def test_swap_respects_k(self, service):
        assert len(service.swap("chicken", k=2)) == 2

    def test_swap_unknown_ingredient_returns_empty(self, service):
        assert service.swap("dragonfruit") == []


class TestCuisineBlend:
    def test_blends_toward_known_cuisine(self, service):
        results = service.cuisine_blend("Chicken", "South Asian", theta_deg=30, k=2, model="core")
        assert len(results) == 2
        assert all("ingredient" in r and "score" in r for r in results)

    def test_unknown_cuisine_returns_empty(self, service):
        assert service.cuisine_blend("chicken", "Atlantis", model="core") == []

    def test_unknown_ingredient_returns_empty(self, service):
        assert service.cuisine_blend("dragonfruit", "South Asian", model="core") == []


class TestIntrospection:
    def test_lists_available_models(self, service):
        assert sorted(service.available_models()) == ["chem", "core"]

    def test_lists_cuisines_as_display_names(self, service):
        cuisines = service.list_cuisines(model="core")
        assert "South Asian" in cuisines

    def test_tokens_returns_model_vocabulary(self, service):
        tokens = service.tokens(model="core")
        assert "chicken" in tokens
        assert "butter" in tokens

    def test_tokens_unknown_model_raises(self, service):
        with pytest.raises(ValueError):
            service.tokens(model="nope")
