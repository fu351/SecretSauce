"""EpicureService: business logic over the Epicure ingredient embedding models.

Wraps one or more loaded Epicure models (``core``, ``chem``, ``cooc``) and adds:

* safe name resolution (free text -> vocab token, never raises on unknowns),
* ingredient *swap* suggestions that blend the flavour-chemistry model and the
  recipe-context model into a single ranked list, and
* cuisine-directed suggestions via SLERP toward a cuisine pole.

The models are injected, which keeps the unit tests fast and offline. Production
construction (downloading the real safetensors) lives in :func:`load_default`.
"""
from __future__ import annotations

from typing import Iterable, Optional

from epicure_names import from_token, resolve_token, to_token

# Default blend weights for swap(): chemistry and recipe-context contribute equally.
DEFAULT_SWAP_WEIGHTS = {"core": 1.0, "chem": 1.0}
CUISINE_POLE_PREFIX = "cuisine:"


class EpicureService:
    def __init__(self, models: dict):
        if not models:
            raise ValueError("EpicureService requires at least one model")
        self._models = dict(models)

    # ----- introspection -----

    def available_models(self) -> list[str]:
        return list(self._models.keys())

    def _model(self, name: str):
        model = self._models.get(name)
        if model is None:
            raise ValueError(f"Unknown epicure model: {name!r}")
        return model

    def list_cuisines(self, model: str = "core") -> list[str]:
        m = self._model(model)
        keys = m.list_supervised_poles(CUISINE_POLE_PREFIX)
        return [_cuisine_display(k) for k in keys]

    # ----- core operators -----

    def neighbors(self, ingredient: str, k: int = 5, model: str = "core") -> list[dict]:
        m = self._model(model)
        token = resolve_token(ingredient, m.vocab)
        if token is None:
            return []
        try:
            ranked = m.neighbors(token, k=k)
        except KeyError:
            return []
        return [_result(name, score) for name, score in ranked]

    def swap(self, ingredient: str, k: int = 5, weights: Optional[dict] = None) -> list[dict]:
        """Blend neighbours across the available swap models into ranked swaps.

        Scores from each contributing model are weighted and summed per token,
        so an ingredient endorsed by both the chemistry and recipe-context
        models outranks one seen by only a single model.
        """
        weights = weights or DEFAULT_SWAP_WEIGHTS
        blended: dict[str, dict] = {}

        for model_name, weight in weights.items():
            model = self._models.get(model_name)
            if model is None:
                continue
            token = resolve_token(ingredient, model.vocab)
            if token is None:
                continue
            try:
                ranked = model.neighbors(token, k=max(k * 3, k))
            except KeyError:
                continue
            for name, score in ranked:
                entry = blended.setdefault(
                    name, {"token": name, "score": 0.0, "sources": []}
                )
                entry["score"] += weight * float(score)
                entry["sources"].append(model_name)

        ordered = sorted(blended.values(), key=lambda e: -e["score"])
        return [
            {
                "ingredient": from_token(e["token"]),
                "token": e["token"],
                "score": round(e["score"], 6),
                "sources": e["sources"],
            }
            for e in ordered[:k]
        ]

    def cuisine_blend(
        self,
        ingredient: str,
        cuisine: str,
        theta_deg: float = 30.0,
        k: int = 5,
        model: str = "core",
    ) -> list[dict]:
        """Rotate an ingredient toward a target cuisine and return suggestions."""
        m = self._model(model)
        token = resolve_token(ingredient, m.vocab)
        if token is None:
            return []
        pole = _resolve_cuisine_pole(cuisine, m)
        if pole is None:
            return []
        try:
            ranked = m.slerp(token, pole, theta_deg=theta_deg, k=k)
        except KeyError:
            return []
        return [_result(name, score) for name, score in ranked]


def _result(token: str, score) -> dict:
    return {"ingredient": from_token(token), "token": token, "score": round(float(score), 6)}


def _cuisine_display(pole_key: str) -> str:
    raw = pole_key[len(CUISINE_POLE_PREFIX):] if pole_key.startswith(CUISINE_POLE_PREFIX) else pole_key
    return raw.replace("_", " ").strip()


def _resolve_cuisine_pole(cuisine: str, model) -> Optional[str]:
    """Match a free-text cuisine name to a supervised pole key on the model."""
    target = to_token(cuisine)
    for key in model.list_supervised_poles(CUISINE_POLE_PREFIX):
        if to_token(_cuisine_display(key)) == target:
            return key
    return None


def load_default(repo_ids: Optional[dict] = None) -> EpicureService:
    """Construct a service backed by the real pretrained models.

    Downloads happen lazily inside ``Epicure.from_pretrained``. Kept out of the
    unit-test path; exercised only when the FastAPI service starts.
    """
    from epicure_loader import Epicure

    repo_ids = repo_ids or {
        "core": "Kaikaku/epicure-core",
        "chem": "Kaikaku/epicure-chem",
        "cooc": "Kaikaku/epicure-cooc",
    }
    models = {name: Epicure.from_pretrained(repo) for name, repo in repo_ids.items()}
    return EpicureService(models=models)
