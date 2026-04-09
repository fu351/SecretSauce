"""
model_recommender.py
====================
Heuristic recommendation layer that decides which OCR engine/strategy to
use *before* running OCR, plus a confidence-based fallback that escalates
to full ensemble when the initial choice underperforms.

How it works
------------
1.  ``extract_image_features()`` computes cheap visual descriptors (<200ms).
2.  ``recommend_strategy()`` scores each engine with a weighted heuristic
    and returns the best strategy plus a confidence score.
3.  After OCR + parsing, ``should_escalate()`` checks the parse result for
    red flags (missing total, too few items, checksum mismatch) and tells
    the caller whether to re-run with full ensemble.

Recalibrating weights
---------------------
Run ``calibrate_recommender.py`` on the test samples to regenerate
``calibration_results.json`` and the ``STORE_ENGINE_PREFERENCE`` map.
Then adjust the ``_WEIGHT_*`` constants below based on the calibration
output.  The goal is to match ensemble accuracy on >=18/20 samples while
using single-engine on >=8/20 to save ~40% latency on those images.

Dependencies: stdlib + image_features (this package).
"""
from __future__ import annotations

import enum
import json
import logging
from dataclasses import dataclass, field
from typing import Optional

import importlib.util as _ilu
import sys as _sys
from pathlib import Path as _Path

_FEATURES_PATH = _Path(__file__).resolve().parent / "image_features.py"
_spec = _ilu.spec_from_file_location("image_features", _FEATURES_PATH)
_features_mod = _ilu.module_from_spec(_spec)          # type: ignore[arg-type]
_sys.modules.setdefault("image_features", _features_mod)
_spec.loader.exec_module(_features_mod)               # type: ignore[union-attr]
ImageFeatures = _features_mod.ImageFeatures
extract_image_features = _features_mod.extract_image_features

# ── Structured JSON logger ──────────────────────────────────────────────────

logger = logging.getLogger("receipt_ocr.recommender")


# ── Strategy enum ───────────────────────────────────────────────────────────


class Strategy(enum.Enum):
    EASYOCR_ONLY = "easyocr_only"
    PADDLEOCR_ONLY = "paddleocr_only"
    ENSEMBLE = "ensemble"
    ENSEMBLE_WITH_REOCR = "ensemble_with_reocr"


# ── Tunable constants ───────────────────────────────────────────────────────
# All thresholds are defined here for easy tuning.

# Image feature thresholds
CONTRAST_LOW = 40.0
CONTRAST_HIGH = 100.0
SKEW_HIGH = 5.0                    # degrees
LAPLACIAN_LOW = 50.0               # blurry / noisy
TEXT_DENSITY_LOW = 0.02
TEXT_DENSITY_HIGH = 0.15

# Heuristic weights (positive = favour that engine)
# Score: positive → EasyOCR, negative → PaddleOCR
_WEIGHT_LOW_RESOLUTION = 0.0       # ensemble (neutral)
_WEIGHT_LOW_CONTRAST = 2.0         # favour EasyOCR (CLAHE helps)
_WEIGHT_HIGH_CONTRAST = -2.0       # favour PaddleOCR (binary threshold)
_WEIGHT_HIGH_SKEW = 1.5            # favour EasyOCR (more skew-tolerant)
_WEIGHT_HIGH_NOISE = 0.0           # ensemble (neutral)
_WEIGHT_THERMAL = -1.5             # favour PaddleOCR
_WEIGHT_LOW_TEXT_DENSITY = 0.0     # ensemble (neutral)
_WEIGHT_HIGH_DPI = -0.5            # slight favour PaddleOCR (clean images)
_WEIGHT_STORE_HINT = 2.5           # moderate boost from known store preference

# Decision boundary
SCORE_ENSEMBLE_THRESHOLD = 2.5     # if |score| < this, default to ensemble

# Escalation thresholds
ESCALATION_MIN_ITEMS = 2
ESCALATION_CHECKSUM_TOLERANCE = 0.05  # dollars

# ── Per-store engine preference ─────────────────────────────────────────────
# Populated by calibrate_recommender.py based on empirical accuracy data.
# Values: "easyocr" or "paddle".  Sign convention: positive = EasyOCR.

STORE_ENGINE_PREFERENCE: dict[str, str] = {
    # Calibrated from test/calibrate_recommender.py (2026-04-07)
    "Trader Joe's": "paddle",     # paddle 64% vs easyocr 27%
    "Walmart": "easyocr",         # mixed results — 3 easyocr wins, 1 paddle
    "Whole Foods": "easyocr",     # tied or easyocr wins
    "SPAR": "easyocr",            # easyocr 50% vs paddle 33%
    "Costco": "easyocr",
    "WinCo Foods": "easyocr",
    "Aldi": "paddle",
    "Kroger": "paddle",
    "Safeway": "paddle",
    "Meijer": "paddle",
    "Target": "paddle",
    "99 Ranch": "easyocr",
    "Andronico's": "easyocr",
}


# ── Recommendation metrics ──────────────────────────────────────────────────


@dataclass
class RecommendationMetrics:
    """Tracks aggregate recommendation statistics for monitoring."""

    total_requests: int = 0
    single_engine_count: int = 0
    ensemble_count: int = 0
    escalation_count: int = 0
    avg_latency_saved_ms: float = 0.0

    def record(self, strategy: Strategy, escalated: bool = False,
               latency_saved_ms: float = 0.0) -> None:
        self.total_requests += 1
        if strategy in (Strategy.EASYOCR_ONLY, Strategy.PADDLEOCR_ONLY):
            self.single_engine_count += 1
        else:
            self.ensemble_count += 1
        if escalated:
            self.escalation_count += 1
        # Running average
        if latency_saved_ms > 0:
            n = self.total_requests
            self.avg_latency_saved_ms = (
                self.avg_latency_saved_ms * (n - 1) + latency_saved_ms
            ) / n

    def to_dict(self) -> dict:
        return {
            "total_requests": self.total_requests,
            "single_engine_count": self.single_engine_count,
            "ensemble_count": self.ensemble_count,
            "escalation_count": self.escalation_count,
            "avg_latency_saved_ms": round(self.avg_latency_saved_ms, 1),
        }


# Module-level metrics singleton
metrics = RecommendationMetrics()


# ── Recommendation dataclass ────────────────────────────────────────────────


@dataclass(frozen=True)
class Recommendation:
    """Result of ``recommend_strategy()``."""
    strategy: Strategy
    confidence: float          # 0.0–1.0
    easyocr_score: float
    paddle_score: float
    reasons: list[str] = field(default_factory=list)


# ── Core recommendation logic ──────────────────────────────────────────────


def recommend_strategy(
    features: ImageFeatures,
    store_hint: Optional[str] = None,
) -> Recommendation:
    """Recommend an OCR strategy based on image features and optional store hint.

    Parameters
    ----------
    features : ImageFeatures
        Pre-computed image descriptors from ``extract_image_features()``.
    store_hint : str, optional
        Store name if known in advance (e.g. from user selection or
        previous parse).  Used to look up per-store engine preferences.

    Returns
    -------
    Recommendation
        Contains the strategy, confidence, per-engine scores, and
        human-readable reasons for the decision.
    """
    # Score: positive → EasyOCR, negative → PaddleOCR, near-zero → ensemble
    score = 0.0
    reasons: list[str] = []

    # ── Resolution ──────────────────────────────────────────────────────
    if features.resolution_bucket == "low":
        reasons.append("low resolution → ensemble (hedge bets)")
        # score stays 0 — will push toward ensemble

    # ── Contrast ────────────────────────────────────────────────────────
    if features.contrast_stddev < CONTRAST_LOW:
        score += _WEIGHT_LOW_CONTRAST
        reasons.append(f"low contrast ({features.contrast_stddev:.1f}) → EasyOCR")
    elif features.contrast_stddev > CONTRAST_HIGH:
        score += _WEIGHT_HIGH_CONTRAST
        reasons.append(f"high contrast ({features.contrast_stddev:.1f}) → PaddleOCR")

    # ── Skew ────────────────────────────────────────────────────────────
    if features.skew_angle > SKEW_HIGH:
        score += _WEIGHT_HIGH_SKEW
        reasons.append(f"high skew ({features.skew_angle:.1f}°) → EasyOCR")

    # ── Noise / blur ────────────────────────────────────────────────────
    if features.laplacian_variance < LAPLACIAN_LOW:
        reasons.append(f"high noise/blur (lap_var={features.laplacian_variance:.1f}) → ensemble")
        # score stays 0 — ensemble

    # ── Thermal print ───────────────────────────────────────────────────
    if features.is_thermal:
        score += _WEIGHT_THERMAL
        reasons.append("thermal print → PaddleOCR")

    # ── DPI ─────────────────────────────────────────────────────────────
    if features.estimated_dpi > 300:
        score += _WEIGHT_HIGH_DPI
        reasons.append(f"high DPI ({features.estimated_dpi:.0f}) → slight PaddleOCR")

    # ── Store hint ──────────────────────────────────────────────────────
    if store_hint and store_hint in STORE_ENGINE_PREFERENCE:
        pref = STORE_ENGINE_PREFERENCE[store_hint]
        if pref == "easyocr":
            score += _WEIGHT_STORE_HINT
        else:
            score -= _WEIGHT_STORE_HINT
        reasons.append(f"store hint '{store_hint}' → {pref}")

    # ── Decision ────────────────────────────────────────────────────────
    abs_score = abs(score)

    if abs_score < SCORE_ENSEMBLE_THRESHOLD:
        strategy = Strategy.ENSEMBLE
        confidence = 0.5
    elif score > 0:
        strategy = Strategy.EASYOCR_ONLY
        confidence = min(1.0, 0.5 + abs_score / 10.0)
    else:
        strategy = Strategy.PADDLEOCR_ONLY
        confidence = min(1.0, 0.5 + abs_score / 10.0)

    # Force ensemble for low resolution regardless of score
    if features.resolution_bucket == "low" and strategy != Strategy.ENSEMBLE:
        strategy = Strategy.ENSEMBLE
        confidence = max(0.4, confidence - 0.2)
        reasons.append("overridden to ensemble due to low resolution")

    # Force ensemble for very noisy images
    if features.laplacian_variance < LAPLACIAN_LOW and strategy != Strategy.ENSEMBLE:
        strategy = Strategy.ENSEMBLE
        confidence = max(0.4, confidence - 0.2)
        reasons.append("overridden to ensemble due to high noise")

    rec = Recommendation(
        strategy=strategy,
        confidence=confidence,
        easyocr_score=score,
        paddle_score=-score,
        reasons=reasons,
    )

    # Structured logging
    logger.info(json.dumps({
        "event": "recommendation",
        "strategy": strategy.value,
        "confidence": round(confidence, 3),
        "easyocr_score": round(score, 2),
        "paddle_score": round(-score, 2),
        "features": {
            "resolution": features.resolution_bucket,
            "contrast": round(features.contrast_stddev, 1),
            "skew": round(features.skew_angle, 1),
            "laplacian_var": round(features.laplacian_variance, 1),
            "text_density": round(features.text_density, 4),
            "is_thermal": features.is_thermal,
            "dpi": round(features.estimated_dpi, 0),
        },
        "store_hint": store_hint,
        "reasons": reasons,
    }))

    return rec


# ── Post-OCR escalation check ──────────────────────────────────────────────


def should_escalate(parse_result: dict) -> bool:
    """Check whether a parse result is poor enough to warrant re-running
    with full ensemble.

    Parameters
    ----------
    parse_result : dict
        Output from ``parse_receipt()`` — must have keys like ``items``,
        ``total``, ``subtotal``, ``taxes``, ``store``.

    Returns
    -------
    bool
        True if the result should be escalated to ensemble.
    """
    reasons: list[str] = []

    items = parse_result.get("items") or []
    total = parse_result.get("total")
    subtotal = parse_result.get("subtotal")
    taxes = parse_result.get("taxes") or []
    store = parse_result.get("store")

    # Too few items
    if len(items) < ESCALATION_MIN_ITEMS:
        reasons.append(f"only {len(items)} items (min {ESCALATION_MIN_ITEMS})")

    # No total found
    if total is None:
        reasons.append("no total found")

    # Store detection failed
    if store is None or store == "Unknown":
        reasons.append("store not detected")

    # Checksum mismatch: subtotal + tax != total
    if subtotal is not None and total is not None:
        tax_total = sum(t.get("amount", 0) for t in taxes) if taxes else 0.0
        expected_total = subtotal + tax_total
        if abs(expected_total - total) > ESCALATION_CHECKSUM_TOLERANCE:
            reasons.append(
                f"checksum mismatch: subtotal({subtotal}) + tax({tax_total}) "
                f"= {expected_total} != total({total})"
            )

    escalate = len(reasons) > 0

    if escalate:
        logger.info(json.dumps({
            "event": "escalation",
            "escalated": True,
            "reasons": reasons,
            "item_count": len(items),
            "total": total,
            "store": store,
        }))

    return escalate
