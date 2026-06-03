"""RED tests for the epicure FastAPI router (offline, fake service injected)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from epicure_api import get_service, router
from epicure_service import EpicureService


@pytest.fixture
def client(fake_core, fake_chem):
    app = FastAPI()
    app.include_router(router)
    service = EpicureService(models={"core": fake_core, "chem": fake_chem})
    app.dependency_overrides[get_service] = lambda: service
    return TestClient(app)


def test_health_lists_loaded_models(client):
    resp = client.get("/epicure/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert sorted(body["models"]) == ["chem", "core"]


def test_neighbors_endpoint_returns_ranked(client):
    resp = client.get("/epicure/neighbors", params={"ingredient": "chicken", "k": 2})
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert [r["token"] for r in body["data"]] == ["pork", "beef"]


def test_neighbors_unknown_ingredient_is_empty_not_error(client):
    resp = client.get("/epicure/neighbors", params={"ingredient": "dragonfruit"})
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_swap_endpoint_blends_sources(client):
    resp = client.get("/epicure/swap", params={"ingredient": "chicken", "k": 2})
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"][0]["token"] == "turkey"


def test_cuisine_blend_endpoint(client):
    resp = client.post(
        "/epicure/cuisine-blend",
        json={"ingredient": "chicken", "cuisine": "South Asian", "theta_deg": 30, "k": 2},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert len(body["data"]) == 2


def test_cuisine_blend_unknown_cuisine_is_empty(client):
    resp = client.post(
        "/epicure/cuisine-blend",
        json={"ingredient": "chicken", "cuisine": "Atlantis"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_cuisines_endpoint(client):
    resp = client.get("/epicure/cuisines")
    assert resp.status_code == 200
    assert "South Asian" in resp.json()["data"]


def test_invalid_k_is_rejected(client):
    resp = client.get("/epicure/neighbors", params={"ingredient": "chicken", "k": 0})
    assert resp.status_code == 422


def test_unknown_model_is_rejected_by_literal(client):
    # `model` is a Literal allowlist, so a bad value is a 422 (not a 400 from the service).
    resp = client.get("/epicure/neighbors", params={"ingredient": "chicken", "model": "bogus"})
    assert resp.status_code == 422


def test_get_service_returns_503_when_models_fail_to_load(monkeypatch):
    """The lazy loader surfaces a 503 (not a crash) if model loading fails."""
    import epicure_api

    monkeypatch.setattr(epicure_api, "_service", None)

    def boom():
        raise RuntimeError("no network")

    monkeypatch.setattr(epicure_api, "load_default", boom)

    with pytest.raises(Exception) as exc_info:
        epicure_api.get_service()
    assert getattr(exc_info.value, "status_code", None) == 503
    monkeypatch.setattr(epicure_api, "_service", None)  # don't leak a bad singleton


def test_endpoint_maps_service_value_error_to_400():
    """A ValueError from the service (e.g. an internal unknown-model path) -> 400."""

    class RaisingService:
        def available_models(self):
            return ["core"]

        def list_cuisines(self, model="core"):
            raise ValueError("Unknown epicure model: 'core'")

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_service] = lambda: RaisingService()
    local_client = TestClient(app)

    resp = local_client.get("/epicure/cuisines")
    assert resp.status_code == 400
