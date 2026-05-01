"""Compatibility package for the store maintenance worker.

The implementation lives in ``backend/workers/store-maintenance-worker``.
This shim makes the worker importable as ``workers.store_maintenance_worker``
from the repository root so ``python -m workers.store_maintenance_worker.runner``
works without relocating the source tree.
"""

from __future__ import annotations

from pathlib import Path

_PACKAGE_DIR = Path(__file__).resolve().parent
_SOURCE_DIR = _PACKAGE_DIR.parent.parent / "backend" / "workers" / "store-maintenance-worker"

if not _SOURCE_DIR.is_dir():
    raise ImportError(f"Store maintenance worker source directory not found: {_SOURCE_DIR}")

# Make submodule resolution (runner.py, modes.py, etc.) point at the real source tree.
__path__ = [str(_SOURCE_DIR)]

