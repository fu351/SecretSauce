"""EpicureService: business logic over the Epicure ingredient embedding models.

Wraps one or more loaded Epicure models (``core``, ``chem``, ``cooc``) and adds:

* safe name resolution (free text -> vocab token, never raises on unknowns),
* ingredient *swap* suggestions that blend the flavour-chemistry (``chem``) and
  ``core`` models into a single ranked list, and
* cuisine-directed suggestions via SLERP toward a cuisine pole.

Note: ``cooc`` (the recipe-context model) is loaded and available for direct
``/neighbors`` queries but is intentionally excluded from the default swap blend
(see ``DEFAULT_SWAP_WEIGHTS``).

The models are injected, which keeps the unit tests fast and offline. Production
construction (downloading the real safetensors) lives in :func:`load_default`.
"""
from __future__ import annotations

from typing import Any, Optional

from epicure_names import from_token, resolve_token, to_token

# Default blend weights for swap(): the chemistry (chem) and core models
# contribute equally. cooc (recipe-context) is loaded but excluded from this blend.
DEFAULT_SWAP_WEIGHTS = {"core": 1.0, "chem": 1.0}
CUISINE_POLE_PREFIX = "cuisine:"
# swap() fetches this many times `k` candidates per model so blending has room to re-rank.
_SWAP_OVERSCAN = 3


class EpicureService:
    def __init__(self, models: dict[str, Any]) -> None:
        if not models:
            raise ValueError("EpicureService requires at least one model")
        self._models = dict(models)

    # ----- introspection -----

    def available_models(self) -> list[str]:
        return list(self._models.keys())

    def _model(self, name: str) -> Any:
        model = self._models.get(name)
        if model is None:
            raise ValueError(f"Unknown epicure model: {name!r}")
        return model

    def list_cuisines(self, model: str = "core") -> list[str]:
        m = self._model(model)
        keys = m.list_supervised_poles(CUISINE_POLE_PREFIX)
        return [_cuisine_display(k) for k in keys]

    def tokens(self, model: str = "core") -> list[str]:
        """Return every vocabulary token for a model (used by the swap export)."""
        return list(self._model(model).vocab.keys())

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
        so an ingredient endorsed by both the chemistry (chem) and core
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
                ranked = model.neighbors(token, k=k * _SWAP_OVERSCAN)
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


# Pin each model to a specific commit so a compromised/edited upstream repo cannot
# silently swap the weights or vocab loaded at runtime (supply-chain integrity).
DEFAULT_MODEL_REVISIONS: dict[str, tuple[str, str]] = {
    "core": ("Kaikaku/epicure-core", "d31ebb5af8e92bbaf5cb67381d5006d4ea8368b7"),
    "chem": ("Kaikaku/epicure-chem", "2461ef3fbafab36d2b1111187a3df98721146861"),
    "cooc": ("Kaikaku/epicure-cooc", "03edd311adde6e39a2eb6f9f3fa78f7396be6b53"),
}


def load_default(repo_revisions: Optional[dict[str, tuple[str, str]]] = None) -> EpicureService:
    """Construct a service backed by the real pretrained models, pinned by commit.

    Downloads happen lazily inside ``Epicure.from_pretrained``. Kept out of the
    unit-test path; exercised only when the FastAPI service starts.
    """
    from epicure_loader import Epicure

    repo_revisions = repo_revisions or DEFAULT_MODEL_REVISIONS
    models = {
        name: Epicure.from_pretrained(repo, revision=revision)
        for name, (repo, revision) in repo_revisions.items()
    }
    return EpicureService(models=models)
