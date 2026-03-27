#!/usr/bin/env python3
"""Store maintenance worker entrypoint.

Usage:
    python -m workers.store_maintenance_worker.runner --mode import
    python -m workers.store_maintenance_worker.runner --mode geo_fix
    python -m workers.store_maintenance_worker.runner --mode backfill [--backfill-loop]
"""

from __future__ import annotations

from . import modes
from .cli import parse_args


def main() -> None:
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
