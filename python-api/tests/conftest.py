"""Shared pytest fixtures for the python-api epicure tests.

Adds the python-api directory to sys.path so the flat ``epicure_*`` modules
import cleanly when pytest is run from the repo root or from python-api/.
"""
import os
import sys

import numpy as np
import pytest

PYTHON_API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PYTHON_API_DIR not in sys.path:
    sys.path.insert(0, PYTHON_API_DIR)


class FakeEpicure:
    """A tiny in-memory stand-in for the real Epicure embedding model.

    It mimics the subset of the loader API the service depends on:
    ``vocab``, ``neighbors``, ``slerp``, ``closest_mode`` and
    ``list_supervised_poles``. Unknown tokens raise ``KeyError`` exactly like
    the real loader so the service's safe-lookup behaviour can be exercised.
    """

    def __init__(self, neighbors_map=None, poles=None):
        self._neighbors = neighbors_map or {}
        self.supervised_poles = poles or {}
        # vocab is the union of every token we know about
        tokens = set(self._neighbors.keys())
        for ranked in self._neighbors.values():
            tokens.update(name for name, _ in ranked)
        self.vocab = {name: i for i, name in enumerate(sorted(tokens))}

    def neighbors(self, name, k=5, exclude_self=True):
        if name not in self.vocab:
            raise KeyError(name)
        return list(self._neighbors.get(name, []))[:k]

    def slerp(self, seed, direction, theta_deg, k=5, exclude_seed=True):
        if seed not in self.vocab:
            raise KeyError(seed)
        if isinstance(direction, str) and direction not in self.supervised_poles:
            raise KeyError(direction)
        # Deterministic fake: return the seed's neighbours, lightly reordered.
        return list(self._neighbors.get(seed, []))[:k]

    def closest_mode(self, name, kind=None, k=3):
        if name not in self.vocab:
            raise KeyError(name)
        return [("mode_0", "umami", 0.5)][:k]

    def list_supervised_poles(self, prefix=None):
        if prefix is None:
            return list(self.supervised_poles.keys())
        return [k for k in self.supervised_poles if k.startswith(prefix)]


@pytest.fixture
def fake_core():
    return FakeEpicure(
        neighbors_map={
            "chicken": [("pork", 0.58), ("beef", 0.57), ("turkey", 0.35), ("tofu", 0.30)],
            "butter": [("margarine", 0.62), ("olive_oil", 0.40), ("ghee", 0.55)],
        },
        poles={"cuisine:South_Asian": np.ones(4, dtype=np.float32)},
    )


@pytest.fixture
def fake_chem():
    return FakeEpicure(
        neighbors_map={
            "chicken": [("turkey", 0.70), ("pork", 0.40), ("duck", 0.65)],
            "butter": [("ghee", 0.80), ("coconut_oil", 0.50)],
        },
        poles={"cuisine:South_Asian": np.ones(4, dtype=np.float32)},
    )
