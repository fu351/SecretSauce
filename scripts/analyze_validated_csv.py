"""
Quick pandas stats for recipe scraper validation CSVs.

Usage:
    python scripts/analyze_validated_csv.py
    python scripts/analyze_validated_csv.py --csv scripts/output/validated.csv
    python scripts/analyze_validated_csv.py --top 25 --out scripts/output/validated_stats.md
"""

import argparse
from pathlib import Path

import pandas as pd


DEFAULT_CSV = Path("scripts/output/validated.csv")


def bool_series(series: pd.Series) -> pd.Series:
    """Normalize common CSV boolean values to pandas nullable booleans."""
    if series.dtype == bool:
        return series.astype("boolean")

    normalized = series.astype("string").str.strip().str.lower()
    return normalized.map(
        {
            "true": True,
            "1": True,
            "yes": True,
            "y": True,
            "false": False,
            "0": False,
            "no": False,
            "n": False,
        }
    ).astype("boolean")


def section(title: str) -> str:
    return f"\n## {title}\n"


def table(frame: pd.DataFrame | pd.Series) -> str:
    if isinstance(frame, pd.Series):
        frame = frame.to_frame()
    if frame.empty:
        return "_None_\n"
    return frame.to_string(index=True) + "\n"


def analyze(csv_path: Path, top: int) -> str:
    df = pd.read_csv(csv_path)
    lines: list[str] = []

    lines.append(f"# Validation Stats: `{csv_path}`\n")
    lines.append(f"- Rows: {len(df):,}")
    lines.append(f"- Columns: {len(df.columns):,}")
    lines.append(f"- Column names: {', '.join(df.columns)}")

    lines.append(section("Missing Values"))
    missing = (
        pd.DataFrame(
            {
                "missing": df.isna().sum(),
                "missing_pct": (df.isna().mean() * 100).round(2),
            }
        )
        .sort_values(["missing", "missing_pct"], ascending=False)
    )
    lines.append(table(missing))

    if "valid" in df.columns:
        valid = bool_series(df["valid"])
        counts = valid.value_counts(dropna=False).rename("count")
        pct = (valid.value_counts(dropna=False, normalize=True) * 100).round(2).rename("pct")
        validity = pd.concat([counts, pct], axis=1)

        lines.append(section("Validity"))
        lines.append(table(validity))

    if "error" in df.columns:
        errors = df["error"].fillna("").astype(str).str.strip()
        error_counts = errors[errors.ne("")].value_counts().head(top).rename("count")

        lines.append(section(f"Top {top} Errors"))
        lines.append(table(error_counts))

    if "domain" in df.columns:
        duplicate_domains = df["domain"][df["domain"].duplicated(keep=False)].value_counts()
        lines.append(section("Duplicate Domains"))
        lines.append(table(duplicate_domains.head(top).rename("count")))

        if "valid" in df.columns:
            by_suffix = df.copy()
            by_suffix["valid_bool"] = bool_series(by_suffix["valid"])
            by_suffix["suffix"] = (
                by_suffix["domain"]
                .astype("string")
                .str.extract(r"(\.[^.]+)$", expand=False)
                .fillna("(unknown)")
            )
            suffix_stats = (
                by_suffix.groupby("suffix", dropna=False)
                .agg(
                    domains=("domain", "count"),
                    valid=("valid_bool", "sum"),
                    valid_rate=("valid_bool", "mean"),
                )
                .sort_values(["domains", "valid_rate"], ascending=[False, False])
            )
            suffix_stats["valid_rate"] = (suffix_stats["valid_rate"] * 100).round(2)

            lines.append(section("Domain Suffix Stats"))
            lines.append(table(suffix_stats.head(top)))

    if "ingredients_count" in df.columns:
        ingredients = pd.to_numeric(df["ingredients_count"], errors="coerce")
        stats = ingredients.describe().round(2).rename("ingredients_count")

        lines.append(section("Ingredients Count"))
        lines.append(table(stats))

        if "domain" in df.columns:
            high = df.assign(ingredients_count_num=ingredients)
            high = high[high["ingredients_count_num"].notna()].sort_values(
                "ingredients_count_num", ascending=False
            )
            lines.append(section(f"Top {top} Ingredient Counts"))
            lines.append(table(high[["domain", "ingredients_count_num", "title", "test_url"]].head(top)))

    if {"domain", "valid", "error"}.issubset(df.columns):
        valid = bool_series(df["valid"])
        failures = df[valid.eq(False)].copy()
        failures["error"] = failures["error"].fillna("").astype(str).str.strip()
        failures["error_bucket"] = failures["error"].replace("", "(empty error)")

        lines.append(section(f"Sample Failed Domains"))
        lines.append(table(failures[["domain", "error_bucket", "test_url"]].head(top)))

    if {"domain", "valid", "title", "test_url"}.issubset(df.columns):
        valid = bool_series(df["valid"])
        successes = df[valid.eq(True)].copy()
        lines.append(section(f"Sample Successful Domains"))
        lines.append(table(successes[["domain", "title", "test_url"]].head(top)))

    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze recipe scraper validation CSV stats.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help=f"CSV to analyze. Default: {DEFAULT_CSV}")
    parser.add_argument("--top", type=int, default=15, help="Rows to show in ranked/sample tables.")
    parser.add_argument("--out", type=Path, help="Optional markdown output path.")
    args = parser.parse_args()

    report = analyze(args.csv, args.top)
    print(report)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
