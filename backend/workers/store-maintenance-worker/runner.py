#!/usr/bin/env python3
"""Store maintenance worker entrypoint.

Usage:
    python -m workers.store_maintenance_worker.runner --mode import
    python -m workers.store_maintenance_worker.runner --mode geo_fix
    python -m workers.store_maintenance_worker.runner --mode backfill [--backfill-loop]
"""

from __future__ import annotations

import os
from pathlib import Path

from . import modes
from .cli import parse_args


def _load_env_file(path: Path) -> None:
    """Load simple KEY=VALUE pairs from a .env file if it exists."""
    if not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue

        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ[key] = value


def _load_repo_env() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    _load_env_file(repo_root / ".env.local")
    _load_env_file(repo_root / ".env")


def main() -> None:
    _load_repo_env()
    args = parse_args()
    if args.mode == "import":
        modes.run_import(args)
    elif args.mode == "geo_fix":
        modes.run_geo_fix(args)
    elif args.mode == "backfill":
        modes.run_backfill(args)
    else:
        raise ValueError(f"Unsupported mode: {args.mode}")


if __name__ == "__main__":
    main()
