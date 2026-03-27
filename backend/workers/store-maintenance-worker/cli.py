"""Argument parsing and config helpers for the store-maintenance worker."""

from __future__ import annotations

import argparse

from .utils import parse_token_set


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Store maintenance orchestrator")
    parser.add_argument("--mode", required=True, choices=["import", "geo_fix", "backfill"])

    parser.add_argument("--brands", help="Comma/space-separated brand list")
    parser.add_argument("--max-spiders", type=int, default=2)

    parser.add_argument("--zipcodes", help="Comma/space-separated ZIP list")
    parser.add_argument("--zip", "-z", action="append", help="ZIP list (repeatable)")

    parser.add_argument("--run-update-target-zipcodes", default="true")
    parser.add_argument("--neighbor-radius", type=int, default=5)
    parser.add_argument("--import-all-zipcodes", action="store_true")
    parser.add_argument("--mark-events-completed", default="true")

    parser.add_argument("--backfill-limit", type=int, default=100)
    parser.add_argument("--backfill-delay", type=float, default=0.1)
    parser.add_argument("--backfill-loop", default="false")
    parser.add_argument("--backfill-max-batches", type=int, default=0)
    parser.add_argument("--backfill-concurrency", type=int, default=10)

    return parser


def parse_args() -> argparse.Namespace:
    return build_arg_parser().parse_args()


def gather_brands(args: argparse.Namespace) -> set[str] | None:
    raw_values: list[str] = []
    if args.brands:
        raw_values.append(args.brands)
    brand_filter = parse_token_set(raw_values)
    return brand_filter if brand_filter else None


def gather_zip_codes(args: argparse.Namespace) -> set[str]:
    raw_values: list[str] = []
    raw_values.extend(args.zip or [])
    if args.zipcodes:
        raw_values.append(args.zipcodes)
    return parse_token_set(raw_values)
